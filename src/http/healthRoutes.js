import { Router } from 'express';

/**
 * Liveness/readiness checks for mongo + redis (ops surface, not auth HTTP).
 *
 * @param {{ mongoDb: object, redis: object }} healthDeps
 */
export default function healthRoutes(healthDeps) {
    const router = Router();

    router.get('/health', async (req, res) => {
        const checks = { mongodb: false, redis: false };
        try {
            await healthDeps.mongoDb.command({ ping: 1 });
            checks.mongodb = true;
        } catch { /* reported below */ }
        try {
            await healthDeps.redis.ping();
            checks.redis = true;
        } catch { /* reported below */ }
        return res.json({
            status: checks.mongodb && checks.redis ? 'ok' : 'degraded',
            checks,
            timestamp: new Date().toISOString()
        });
    });

    return router;
}
