# auth-service

IITD OAuth 2 identity service for Research Ambit.

## Responsibilities

- `GET /api/auth/login` — mints a one-time CSRF `state` (Redis, 10 min TTL) and
  redirects to `https://oauth.iitd.ac.in/authorize.php`.
- `GET /api/auth/callback` — validates `state`, exchanges the `code` at
  `token.php`, fetches the profile from `resource.php`, upserts the user into
  its own Mongo `users` collection, issues **our own JWT** (the IITD
  `access_token` is never forwarded), sets it as an `httpOnly; Secure;
  SameSite=Lax` cookie, and redirects to the SPA.
- `GET /api/auth/me` — current session claims from the cookie.
- `POST /api/auth/logout` — clears the cookie.
- gRPC `auth.v1.AuthService` (`VerifyToken`, `GetUser`) on `:50051`, consumed
  by the api-gateway through Envoy.

## Notes

- The registered Redirect URI is
  `https://researchambit.iitd.ac.in/api/auth/callback` and must match exactly.
- Outbound calls to `oauth.iitd.ac.in` honour `HTTP(S)_PROXY` / `NO_PROXY`
  (campus proxy `proxy22.iitd.ac.in:3128`, injected via `deploy/prod/proxy.env`).
- `AUTH_JWT_SECRET` is deliberately a different variable from the CMS
  backend's `JWT_SECRET`; portal sessions and CMS admin tokens must never
  cross-validate.
- Layout: `src/config.js` (env), `src/ports/` (interfaces), `src/adapters/`
  (IITD OAuth client, Redis state store, Mongo user repo, JWT issuer),
  `src/services/authFlow.js` (orchestration), `src/http/` + `src/grpc/`
  (transports), `src/server.js` (composition root).

## Env

See `.env.example` (local) and `.env.docker` (compose template — fill in
`IITD_OAUTH_CLIENT_ID`, `IITD_OAUTH_CLIENT_SECRET`, `AUTH_JWT_SECRET`).
