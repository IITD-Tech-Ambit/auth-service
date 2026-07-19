// Environment configuration — the only module that reads process.env.
export default {
    port: parseInt(process.env.PORT || '4000', 10),
    host: process.env.HOST || '0.0.0.0',
    logLevel: process.env.LOG_LEVEL || 'info',

    // Secure-by-default auth toggle. MUST stay true (or unset) in production.
    // Only an explicit ENABLE_AUTH=false bypasses IITD OAuth for local testing.
    enableAuth: (process.env.ENABLE_AUTH || 'true') !== 'false',

    grpc: {
        bindAddress: process.env.GRPC_BIND_ADDRESS || '0.0.0.0:50051'
    },

    oauth: {
        clientId: process.env.IITD_OAUTH_CLIENT_ID || '',
        clientSecret: process.env.IITD_OAUTH_CLIENT_SECRET || '',
        authorizeUrl: process.env.IITD_OAUTH_AUTHORIZE_URL || 'https://oauth.iitd.ac.in/authorize.php',
        tokenUrl: process.env.IITD_OAUTH_TOKEN_URL || 'https://oauth.iitd.ac.in/token.php',
        resourceUrl: process.env.IITD_OAUTH_RESOURCE_URL || 'https://oauth.iitd.ac.in/resource.php',
        // Must byte-match the Redirect URI registered with the IITD webgroup.
        redirectUri: process.env.OAUTH_REDIRECT_URI || 'https://researchambit.iitd.ac.in/api/auth/callback',
        stateTtlSec: parseInt(process.env.OAUTH_STATE_TTL_SEC || '600', 10),
        requestTimeoutMs: parseInt(process.env.OAUTH_REQUEST_TIMEOUT_MS || '10000', 10)
    },

    session: {
        // Deliberately a DIFFERENT env var from the CMS backend's JWT_SECRET
        // so portal sessions and CMS admin tokens can never cross-validate.
        jwtSecret: process.env.AUTH_JWT_SECRET || '',
        ttlSec: parseInt(process.env.SESSION_TTL_SEC || String(7 * 24 * 3600), 10),
        cookieName: process.env.SESSION_COOKIE_NAME || 'ra_session',
        cookieSecure: (process.env.SESSION_COOKIE_SECURE || 'true') === 'true'
    },

    postLoginRedirect: process.env.POST_LOGIN_REDIRECT || '/',

    mongo: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/auth_service',
        usersCollection: process.env.USERS_COLLECTION || 'users'
    },

    redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379'
    }
};

export function validateConfig(config, logger) {
    if (!config.session.jwtSecret) {
        throw new Error('AUTH_JWT_SECRET is required — refusing to start with an empty signing key');
    }
    if (!config.enableAuth) {
        logger.warn('ENABLE_AUTH=false — IITD OAuth is BYPASSED and every session resolves to a mock dev user. NEVER run like this in production.');
    }
    if (!config.oauth.clientId || !config.oauth.clientSecret) {
        logger.warn('IITD_OAUTH_CLIENT_ID / IITD_OAUTH_CLIENT_SECRET not set — OAuth login will fail until the webgroup issues credentials');
    }
}
