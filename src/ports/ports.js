/**
 * Ports (interfaces) the auth flow depends on. Concrete adapters live in
 * ../adapters and are wired in the composition root (server.js).
 *
 * @typedef {Object} IdentityProfile  Normalized identity from any IdP adapter
 * @property {string} user_id
 * @property {string} email
 * @property {string} name
 * @property {string} unique_id        Stable subject id (fallback: user_id)
 * @property {string} category
 * @property {string} department
 *
 * @typedef {Object} SessionClaims    Claims embedded in our own session JWT
 * @property {string} sub             unique_id (fallback: user_id)
 * @property {string} user_id
 * @property {string} email
 * @property {string} name
 * @property {string} kerberos
 * @property {string} department
 * @property {string} category
 *
 * @typedef {Object} OAuthProvider    Speaks an OAuth 2 authorization-code flow
 * @property {(state: string) => string} buildAuthorizeUrl
 * @property {(code: string) => Promise<string>} exchangeCode   returns access_token
 * @property {(accessToken: string) => Promise<IdentityProfile>} fetchProfile
 *
 * @typedef {Object} StateStore       One-time CSRF state persistence
 * @property {(state: string) => Promise<void>} put
 * @property {(state: string) => Promise<boolean>} consume  true iff state existed (deleted atomically)
 *
 * @typedef {Object} UserRepository   users collection owned by auth-service
 * @property {(profile: IdentityProfile) => Promise<object>} upsertFromProfile
 * @property {(userId: string) => Promise<object|null>} findByUserId
 *
 * @typedef {Object} TokenIssuer      Application session JWTs
 * @property {(claims: SessionClaims) => string} issue
 * @property {(token: string) => { valid: boolean, claims?: SessionClaims, error?: string }} verify
 *
 * @typedef {Object} AuthApplication  Thin application port for HTTP/gRPC transports
 * @property {() => Promise<string>} beginLogin
 * @property {(code: string, state: string) => Promise<{ sessionToken: string, claims: SessionClaims }>} completeLogin
 * @property {(token: string) => { valid: boolean, claims?: SessionClaims, error?: string }} verifySession
 * @property {(userId: string) => Promise<object|null>} getUser
 */

export {}; // documentation-only module (JSDoc types)
