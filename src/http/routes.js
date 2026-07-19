import { Router } from 'express';
import { AuthFlowError } from '../services/authFlow.js';

/**
 * Public HTTP surface, served behind the api-gateway at /api/auth/*.
 * The OAuth callback path must byte-match the Redirect URI registered with
 * the IITD webgroup: https://researchambit.iitd.ac.in/api/auth/callback
 *
 * @param {{ auth: import('../ports/ports.js').AuthApplication, config: object,
 *           logger: import('pino').Logger }} deps
 */
export default function authRoutes({ auth, config, logger }) {
    const router = Router();

    const cookieOptions = {
        httpOnly: true,
        secure: config.session.cookieSecure,
        sameSite: 'lax',
        path: '/',
        // Express res.cookie takes maxAge in milliseconds (Fastify used seconds).
        maxAge: config.session.ttlSec * 1000
    };

    router.get('/api/auth/login', async (req, res) => {
        const authorizeUrl = await auth.beginLogin();
        return res.redirect(302, authorizeUrl);
    });

    router.get('/api/auth/callback', async (req, res) => {
        const { code, state } = req.query;
        try {
            const { sessionToken } = await auth.completeLogin(code, state);
            res.cookie(config.session.cookieName, sessionToken, cookieOptions);
            return res.redirect(302, config.postLoginRedirect);
        } catch (error) {
            const reason = error instanceof AuthFlowError ? error.code : 'oauth_failed';
            logger.error({ err: error.message, reason }, 'OAuth callback failed');
            // Land back on the SPA with a marker the frontend can surface.
            return res.redirect(302, `${config.postLoginRedirect}?auth_error=${reason}`);
        }
    });

    router.get('/api/auth/me', async (req, res) => {
        const token = req.cookies?.[config.session.cookieName];
        const result = auth.verifySession(token);
        if (!result.valid) {
            if (token) res.clearCookie(config.session.cookieName, { path: '/' });
            return res.status(401).json({
                error: 'Unauthorized',
                message: token ? 'Session expired' : 'Not logged in',
                statusCode: 401
            });
        }
        const { iat, exp, iss, ...user } = result.claims;
        return res.json({ user });
    });

    router.post('/api/auth/logout', async (req, res) => {
        res.clearCookie(config.session.cookieName, { path: '/' });
        return res.json({ ok: true });
    });

    return router;
}
