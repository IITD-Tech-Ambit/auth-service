import { Router } from 'express';
import { AuthFlowError } from '../services/authFlow.js';
import { recordAuthOauthEvent } from '../metrics.js';

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

    const baseCookie = {
        httpOnly: true,
        secure: config.session.cookieSecure,
        sameSite: 'lax'
    };
    const sessionCookie = { ...baseCookie, path: '/' };
    const stateCookieName = `${config.session.cookieName}_state`;
    // Path /api/auth so the state cookie is only sent to the OAuth routes.
    const stateCookie = { ...baseCookie, path: '/api/auth' };

    router.get('/api/auth/login', async (req, res) => {
        const authorizeUrl = await auth.beginLogin();
        const state = new URL(authorizeUrl).searchParams.get('state');
        res.cookie(stateCookieName, state, { ...stateCookie, maxAge: config.oauth.stateTtlSec * 1000 });
        return res.redirect(302, authorizeUrl);
    });

    router.get('/api/auth/callback', async (req, res) => {
        const code = typeof req.query.code === 'string' ? req.query.code : '';
        const state = typeof req.query.state === 'string' ? req.query.state : '';
        const browserState = req.cookies?.[stateCookieName];
        res.clearCookie(stateCookieName, stateCookie);
        try {
            if (!state || state !== browserState) {
                throw new AuthFlowError('invalid_state', 'OAuth state does not match this browser');
            }
            const { sessionToken } = await auth.completeLogin(code, state);
            res.cookie(config.session.cookieName, sessionToken, { ...sessionCookie, maxAge: config.session.ttlSec * 1000 });
            recordAuthOauthEvent('success', 'ok');
            return res.redirect(302, config.postLoginRedirect);
        } catch (error) {
            const reason = error instanceof AuthFlowError ? error.code : 'oauth_failed';
            const cause = error?.cause;
            logger.error({
                err: error.message,
                cause: cause?.message || cause?.code,
                reason
            }, 'OAuth callback failed');
            recordAuthOauthEvent('failure', reason);
            return res.redirect(302, `${config.postLoginRedirect}?auth_error=${reason}`);
        }
    });

    router.get('/api/auth/me', async (req, res) => {
        const token = req.cookies?.[config.session.cookieName];
        const result = auth.verifySession(token);
        if (!result.valid) {
            if (token) res.clearCookie(config.session.cookieName, sessionCookie);
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
        res.clearCookie(config.session.cookieName, sessionCookie);
        return res.json({ ok: true });
    });

    return router;
}
