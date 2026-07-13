/**
 * One-time OAuth CSRF state store backed by Redis (SET EX + GETDEL).
 *
 * @implements {import('../ports/ports.js').StateStore}
 */
export default class RedisStateStore {
    /**
     * @param {import('ioredis').Redis} redis
     * @param {number} ttlSec
     */
    constructor(redis, ttlSec) {
        this._redis = redis;
        this._ttlSec = ttlSec;
    }

    _key(state) {
        return `auth:oauth:state:${state}`;
    }

    async put(state) {
        await this._redis.set(this._key(state), '1', 'EX', this._ttlSec);
    }

    /** Atomically consume: valid at most once, expires with the TTL. */
    async consume(state) {
        const value = await this._redis.getdel(this._key(state));
        return value !== null;
    }
}
