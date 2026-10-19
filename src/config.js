export default {
    production: process.env.NODE_ENV === 'production',
    port: parseInt(process.env.PORT || '4000', 10),
    host: process.env.HOST || '0.0.0.0',
    logLevel: process.env.LOG_LEVEL || 'info',

    // false makes verifySession return a fixed dev user. Login routes still run.
    // Startup refuses this when NODE_ENV is production.
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

    superadminKerberos: (process.env.SUPERADMIN_KERBEROS || '')
        .split(',')
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean),

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
    if (config.session.jwtSecret.length < 32) {
        throw new Error('AUTH_JWT_SECRET must be at least 32 characters — refusing to start with a weak signing key');
    }
    if (!config.enableAuth && config.production) {
        throw new Error('ENABLE_AUTH=false is not allowed when NODE_ENV=production — refusing to bypass IITD OAuth');
    }
    if (!config.enableAuth) {
        logger.warn('ENABLE_AUTH=false — IITD OAuth is BYPASSED and every session resolves to a mock dev user. NEVER run like this in production.');
    }
    if (!config.oauth.clientId || !config.oauth.clientSecret) {
        logger.warn('IITD_OAUTH_CLIENT_ID / IITD_OAUTH_CLIENT_SECRET not set — OAuth login will fail until the webgroup issues credentials');
    }
}
