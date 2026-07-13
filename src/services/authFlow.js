import crypto from 'crypto';

/**
 * OAuth login orchestration. Depends only on ports — no gRPC/Redis/HTTP
 * client code here. IdP field mapping stays in the OAuth adapter.
 *
 * @implements {import('../ports/ports.js').AuthApplication}
 */
export default class AuthFlow {
    /**
     * @param {{ oauthProvider: import('../ports/ports.js').OAuthProvider,
     *           stateStore: import('../ports/ports.js').StateStore,
     *           userRepository: import('../ports/ports.js').UserRepository,
     *           tokenIssuer: import('../ports/ports.js').TokenIssuer,
     *           logger: import('pino').Logger }} deps
     */
    constructor({ oauthProvider, stateStore, userRepository, tokenIssuer, logger }) {
        this._oauth = oauthProvider;
        this._states = stateStore;
        this._users = userRepository;
        this._tokens = tokenIssuer;
        this._logger = logger;
    }

    async beginLogin() {
        const state = crypto.randomBytes(16).toString('hex');
        await this._states.put(state);
        return this._oauth.buildAuthorizeUrl(state);
    }

    /**
     * Complete the flow: validate state, exchange code, fetch profile, upsert
     * the user, and issue OUR session JWT. The IdP access_token never leaves
     * this method.
     *
     * @returns {Promise<{ sessionToken: string, claims: import('../ports/ports.js').SessionClaims }>}
     */
    async completeLogin(code, state) {
        if (!code || !state) {
            throw new AuthFlowError('missing_params', 'Missing code or state');
        }
        const stateOk = await this._states.consume(state);
        if (!stateOk) {
            throw new AuthFlowError('invalid_state', 'Unknown or reused OAuth state');
        }

        const accessToken = await this._oauth.exchangeCode(code);
        const profile = await this._oauth.fetchProfile(accessToken);
        const user = await this._users.upsertFromProfile(profile);

        const claims = {
            sub: profile.unique_id || profile.user_id,
            user_id: profile.user_id,
            email: profile.email,
            name: profile.name,
            kerberos: user?.kerberos || profile.user_id.toLowerCase(),
            department: profile.department,
            category: profile.category
        };
        const sessionToken = this._tokens.issue(claims);
        this._logger.info({ user_id: profile.user_id, department: profile.department }, 'OAuth login completed');
        return { sessionToken, claims };
    }

    verifySession(token) {
        return this._tokens.verify(token);
    }

    getUser(userId) {
        return this._users.findByUserId(userId);
    }
}

export class AuthFlowError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
