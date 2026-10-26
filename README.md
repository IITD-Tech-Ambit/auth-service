# auth-service

Identity service for IIT Delhi Research Ambit. It runs the IITD OAuth (Kerberos) authorization-code login, keeps a local user record, and issues the application session. The API gateway learns who the caller is by asking this service to verify that session. The IITD access token is not a platform credential.

## System design

This process is the session issuer. It signs session JWTs with `AUTH_JWT_SECRET` and `iss` set to `research-ambit-auth`, and `VerifyToken` checks both. `AUTH_JWT_SECRET` is a different variable from the CMS backend's `JWT_SECRET`; this process never reads `JWT_SECRET`. Callers that need a trusted identity use `auth.v1.AuthService/VerifyToken`. The service definition states that the api-gateway (and any other service that needs a trusted identity) reaches that RPC through Envoy. This process does not embed Envoy; it binds gRPC itself.

```
Browser
  |  GET /api/auth/login | callback | me    POST /api/auth/logout
  |  cookies: <SESSION_COOKIE_NAME>, <SESSION_COOKIE_NAME>_state
  v
HTTP  HOST:PORT (default 0.0.0.0:4000)          gRPC  GRPC_BIND_ADDRESS
express (cookie-parser)                         (default 0.0.0.0:50051, insecure)
  /api/auth/*   /health   /metrics              auth.v1.AuthService
        \                                         VerifyToken | GetUser
         \                                       /
          AuthFlow  (src/services/authFlow.js)
            |-- RedisStateStore ---- REDIS_URL
            |     key auth:oauth:state:<state>   SET EX, consume via GETDEL
            |-- MongoUserRepository -- MONGODB_URI / USERS_COLLECTION
            |     unique index on user_id
            |-- JwtTokenIssuer ------ HS256, iss research-ambit-auth
            |-- IitdOAuthClient ------ IITD_OAUTH_* URLs
                  direct Agent; ignores campus and env proxies
```

`src/server.js` is the composition root: it checks config, connects MongoDB and Redis, builds the four adapters, and starts HTTP and gRPC in one process. `GET /health` pings both stores. `GET /metrics` exposes Prometheus metrics on the same HTTP port.

### Login

`GET /api/auth/login` calls `AuthFlow.beginLogin`:

1. Draw 16 random bytes and hex-encode them as `state`.
2. Store it in Redis with TTL `OAUTH_STATE_TTL_SEC` (default 600). The value is the literal `1`.
3. Build the authorize URL: `response_type=code`, `client_id`, and `state`. No `scope` and no `redirect_uri` are sent.
4. Set the state cookie `<SESSION_COOKIE_NAME>_state` (default `ra_session_state`) to that same value, `Path=/api/auth`, `Max-Age` equal to the Redis TTL, then 302 to the authorize URL.

The browser returns to `GET /api/auth/callback?code&state`. The handler clears the state cookie immediately, then rejects the request before any call to IITD if `state` is missing or not equal to the cookie. `completeLogin` then:

1. Rejects a missing `code` (`missing_params`).
2. Consumes the Redis key with `GETDEL`. A missing, expired, or already-used state is `invalid_state`. Consumption happens before the code is exchanged, so a failed exchange cannot reuse the same state.
3. POSTs `application/x-www-form-urlencoded` to the token URL with `client_id`, `client_secret`, `grant_type=authorization_code`, and `code`. Requires `access_token` in the JSON body.
4. POSTs that access token to the resource URL. Requires `user_id`. Maps `mail` to email, `uniqueiitdid` to `unique_id` (fallback `user_id`), and copies `name`, `category`, and `department`.
5. Upserts the `users` document (kerberos is the lowercased `user_id`) and signs a session JWT from the profile. The access token is not returned and is not written to MongoDB or the JWT.
6. Sets the session cookie (`Max-Age` = `SESSION_TTL_SEC`) and 302s to `POST_LOGIN_REDIRECT` (default `/`).

Callback failures 302 to `POST_LOGIN_REDIRECT?auth_error=<reason>`. Reasons from this service are `invalid_state`, `missing_params`, and `oauth_failed`. A Redis error on `GET /api/auth/login` is not turned into that redirect; that route has no error mapping of its own.

### Session token

`JwtTokenIssuer` signs with HS256, `expiresIn` = `SESSION_TTL_SEC` (default 604800), and issuer `research-ambit-auth`. Claims placed in the token:

| Claim | Source |
| --- | --- |
| `sub` | IITD `uniqueiitdid`, or `user_id` if that field is empty |
| `user_id` | IITD `user_id` |
| `email`, `name`, `department`, `category` | resource profile (`mail` mapped to `email`) |
| `kerberos` | lowercased `user_id` stored on the user document |
| `iss`, `iat`, `exp` | added by the signer |

Not in the token: the IITD `access_token`, the client secret, and `role`. `verifySession` also drops a `role` claim if one is present, then sets `role` to `superadmin` only when the lowercased `kerberos` is in `SUPERADMIN_KERBEROS` (comma-separated, trimmed, lowercased at startup). That check runs for `GET /api/auth/me` and gRPC `VerifyToken`. `GetUser` reads the Mongo document and does not compute the role. Changing the list takes effect on process restart; existing JWTs do not carry the role, so the next verify uses the new list.

`GET /api/auth/me` reads `<SESSION_COOKIE_NAME>` (default `ra_session`), verifies it, and returns the claims without `iat`, `exp`, and `iss`. If the cookie is absent the response is 401 with message `Not logged in`. If a token is present but verification fails, the cookie is cleared and the message is `Session expired`, including when the token is malformed rather than expired. gRPC `VerifyToken` reports `expired` or `invalid` in `error` instead. `POST /api/auth/logout` clears the cookie and returns `{ "ok": true }`. There is no server-side session store or revocation list; a copy of the JWT remains valid until `exp`.

`ENABLE_AUTH=false` does not skip the login routes. It makes `verifySession` ignore the presented token and return a fixed dev identity (`sub` `dev-0000000`, `user_id` and `kerberos` `devuser`, email `devuser@iitd.ac.in`). The superadmin check still runs on that identity. Startup throws if that setting is combined with `NODE_ENV=production`.

### Cookies and checks

Session and state cookies are `HttpOnly` and `SameSite=Lax`. `Secure` follows `SESSION_COOKIE_SECURE` (default `true`). The session cookie path is `/`. The state cookie path is `/api/auth`, so the browser only sends it to the auth routes.

Startup throws if `AUTH_JWT_SECRET` is shorter than 32 characters. Verify accepts only `HS256` and only issuer `research-ambit-auth`. gRPC is bound with insecure credentials and does not authenticate its caller.

### IITD OAuth

Default endpoints, overridable by env:

- `IITD_OAUTH_AUTHORIZE_URL` — `https://oauth.iitd.ac.in/authorize.php`
- `IITD_OAUTH_TOKEN_URL` — `https://oauth.iitd.ac.in/token.php`
- `IITD_OAUTH_RESOURCE_URL` — `https://oauth.iitd.ac.in/resource.php`

Each token and resource POST aborts after `OAUTH_REQUEST_TIMEOUT_MS` (default 10000). Those calls use a direct undici `Agent` and do not read proxy environment variables. `oauth.iitd.ac.in` is on the campus network.

The callback route is `GET /api/auth/callback`. `OAUTH_REDIRECT_URI` (default `https://researchambit.iitd.ac.in/api/auth/callback`) is loaded into config and is not added to the authorize or token request. The route comment records that public URL as the redirect URI registered with the IITD webgroup. Missing `IITD_OAUTH_CLIENT_ID` or `IITD_OAUTH_CLIENT_SECRET` logs a warning and does not stop the process; login then fails at the token request.

## HTTP and gRPC

Served on `HOST`:`PORT`. The route module comments that these paths are what the api-gateway exposes under `/api/auth/*`.

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/auth/login` | Mint state, set the state cookie, redirect to IITD |
| `GET` | `/api/auth/callback` | Check state, issue the session cookie, redirect to `POST_LOGIN_REDIRECT` |
| `GET` | `/api/auth/me` | Session claims from the cookie, or 401 |
| `POST` | `/api/auth/logout` | Clear the session cookie |
| `GET` | `/health` | MongoDB and Redis pings; body `ok` or `degraded`, HTTP status 200 either way |
| `GET` | `/metrics` | Prometheus text, including `auth_oauth_events_total{result,reason}` |

gRPC `auth.v1.AuthService` on `GRPC_BIND_ADDRESS`. The loader reads `$PROTO_DIR/auth/v1/auth.proto`. Unset, `PROTO_DIR` resolves to `../../../protos` from `src/grpc` (a directory outside this package). The image sets `PROTO_DIR=/app/protos` and copies this repo's `protos/` there.

- `VerifyToken` — verify a session JWT and return the user, including `role` when computed
- `GetUser` — load the stored profile by `user_id`; `found` is false when absent

## Configuration

`src/server.js` loads a local `.env` through `dotenv`. `src/config.js` reads the settings below. Two other modules read `process.env` directly: the logger (`NODE_ENV`, pretty output unless `production`) and the gRPC loader (`PROTO_DIR`). The OAuth client does not read proxy variables. Names and defaults:

| Variable | Default / rule |
| --- | --- |
| `PORT` | `4000` |
| `HOST` | `0.0.0.0` |
| `LOG_LEVEL` | `info` |
| `NODE_ENV` | `production` refuses `ENABLE_AUTH=false` and selects JSON logs |
| `ENABLE_AUTH` | on unless the value is `false` |
| `GRPC_BIND_ADDRESS` | `0.0.0.0:50051` |
| `IITD_OAUTH_CLIENT_ID`, `IITD_OAUTH_CLIENT_SECRET` | empty; login fails until set |
| `IITD_OAUTH_AUTHORIZE_URL`, `IITD_OAUTH_TOKEN_URL`, `IITD_OAUTH_RESOURCE_URL` | IITD URLs above |
| `OAUTH_REDIRECT_URI` | public callback URL; not sent on OAuth requests |
| `OAUTH_STATE_TTL_SEC` | `600` |
| `OAUTH_REQUEST_TIMEOUT_MS` | `10000` |
| `AUTH_JWT_SECRET` | required, at least 32 characters; not `JWT_SECRET` |
| `SESSION_TTL_SEC` | `604800` |
| `SESSION_COOKIE_NAME` | `ra_session` |
| `SESSION_COOKIE_SECURE` | `true` |
| `SUPERADMIN_KERBEROS` | empty list |
| `POST_LOGIN_REDIRECT` | `/` |
| `MONGODB_URI` | `mongodb://localhost:27017/auth_service` |
| `USERS_COLLECTION` | `users` |
| `REDIS_URL` | `redis://localhost:6379` |
| `PROTO_DIR` | `../../../protos` from `src/grpc`; image sets `/app/protos` |

A local template is `.env.example`. Do not commit secret values.

## Local development

`MONGODB_URI` defaults to a MongoDB on localhost. Pointing it at the VM writes login records into the production user collection. Use a local MongoDB and Redis, and an `AUTH_JWT_SECRET` that is not the production value. `ENABLE_AUTH=false` makes `verifySession` return a fixed dev user and is refused when `NODE_ENV` is `production`. Leave it unset except for a local experiment.

## Run

Node.js 20 or newer. MongoDB and Redis must be reachable before startup; the process connects to both and creates the unique `user_id` index before it listens.

```
npm start
npm run dev
```

`npm start` runs `node src/server.js`. `npm run dev` runs the same file with `node --watch`. `SIGINT` and `SIGTERM` stop the gRPC server, close HTTP, and disconnect MongoDB and Redis.
