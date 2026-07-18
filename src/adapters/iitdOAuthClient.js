import { ProxyAgent, Agent } from 'undici';

/**
 * IITD OAuth 2 protocol adapter (authorize.php / token.php / resource.php).
 *
 * Outbound calls to oauth.iitd.ac.in go through the campus HTTP proxy when
 * OAUTH_HTTP_PROXY_URL is set. Deliberately NOT the standard HTTP_PROXY/
 * HTTPS_PROXY env vars (previously used via undici's EnvHttpProxyAgent):
 * those are container-wide, so any other process in the same container
 * (e.g. wget, used by Coolify's health check) also picks them up and tries
 * to route loopback health-check requests through the proxy too — this
 * BusyBox wget build doesn't honor NO_PROXY, so that produced a bogus 503
 * on every health check even though the app itself was healthy. Reading an
 * app-specific var here keeps proxy usage scoped to exactly the one thing
 * that needs it.
 *
 * Maps IITD resource.php fields onto the domain IdentityProfile at this boundary.
 *
 * @implements {import('../ports/ports.js').OAuthProvider}
 */
export default class IitdOAuthClient {
    /**
     * @param {{ clientId: string, clientSecret: string, authorizeUrl: string,
     *           tokenUrl: string, resourceUrl: string, requestTimeoutMs: number }} oauthConfig
     * @param {import('pino').Logger} logger
     */
    constructor(oauthConfig, logger) {
        this._config = oauthConfig;
        this._logger = logger;
        const proxyUrl = process.env.OAUTH_HTTP_PROXY_URL;
        this._dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : new Agent();
    }

    buildAuthorizeUrl(state) {
        const url = new URL(this._config.authorizeUrl);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('client_id', this._config.clientId);
        url.searchParams.set('state', state);
        return url.toString();
    }

    async _postForm(url, params) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(params).toString(),
            dispatcher: this._dispatcher,
            signal: AbortSignal.timeout(this._config.requestTimeoutMs)
        });
        if (!response.ok) {
            throw new Error(`IITD OAuth endpoint ${url} returned ${response.status}`);
        }
        return response.json();
    }

    /** @returns {Promise<string>} access_token */
    async exchangeCode(code) {
        const data = await this._postForm(this._config.tokenUrl, {
            client_id: this._config.clientId,
            client_secret: this._config.clientSecret,
            grant_type: 'authorization_code',
            code
        });
        if (!data.access_token) {
            this._logger.warn({ keys: Object.keys(data || {}) }, 'token.php response missing access_token');
            throw new Error('IITD OAuth code exchange failed');
        }
        return data.access_token;
    }

    /** @returns {Promise<import('../ports/ports.js').IdentityProfile>} */
    async fetchProfile(accessToken) {
        const data = await this._postForm(this._config.resourceUrl, {
            access_token: accessToken
        });
        if (!data.user_id) {
            throw new Error('IITD OAuth resource.php returned no user_id');
        }
        const userId = String(data.user_id);
        return {
            user_id: userId,
            email: String(data.mail || ''),
            name: String(data.name || ''),
            unique_id: String(data.uniqueiitdid || userId),
            category: String(data.category || ''),
            department: String(data.department || '')
        };
    }

    async close() {
        await this._dispatcher.close();
    }
}
