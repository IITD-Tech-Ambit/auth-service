import jwt from 'jsonwebtoken';

/**
 * Application session JWTs. Signed with AUTH_JWT_SECRET — a different secret
 * from the CMS backend's JWT_SECRET, so the two audiences never cross-verify.
 *
 * @implements {import('../ports/ports.js').TokenIssuer}
 */
export default class JwtTokenIssuer {
    /**
     * @param {{ jwtSecret: string, ttlSec: number }} sessionConfig
     */
    constructor({ jwtSecret, ttlSec }) {
        this._secret = jwtSecret;
        this._ttlSec = ttlSec;
    }

    /** @param {import('../ports/ports.js').SessionClaims} claims */
    issue(claims) {
        return jwt.sign(claims, this._secret, {
            expiresIn: this._ttlSec,
            issuer: 'research-ambit-auth'
        });
    }

    verify(token) {
        try {
            const claims = jwt.verify(token, this._secret, { issuer: 'research-ambit-auth' });
            return { valid: true, claims };
        } catch (error) {
            return {
                valid: false,
                error: error.name === 'TokenExpiredError' ? 'expired' : 'invalid'
            };
        }
    }
}
