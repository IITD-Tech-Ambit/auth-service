import { Router } from 'express';
import client from 'prom-client';

/**
 * Prometheus metrics for auth-service.
 *
 * Single process (no PM2 cluster), internal-only network — /metrics is
 * served directly on the app's own HTTP port (never proxied publicly by
 * nginx). Uses the SAME metric name/label scheme as every other service
 * (http_request_duration_seconds{method,route,status_code}) so dashboards
 * and alert rules stay uniform across the platform.
 */

const register = new client.Registry();
register.setDefaultLabels({ service: 'auth-service' });
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    registers: [register]
});

function resolveRoute(req) {
    if (req.route?.path) {
        const base = req.baseUrl || '';
        return `${base}${req.route.path}` || '/';
    }
    return 'unmatched';
}

export function metricsMiddleware(req, res, next) {
    if (req.path === '/metrics') {
        return next();
    }
    const start = process.hrtime.bigint();
    res.on('finish', () => {
        const seconds = Number(process.hrtime.bigint() - start) / 1e9;
        httpRequestDuration
            .labels(req.method, resolveRoute(req), String(res.statusCode))
            .observe(seconds);
    });
    next();
}

export const metricsRouter = Router();
metricsRouter.get('/metrics', async (req, res) => {
    try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch (err) {
        res.status(500).end(String(err));
    }
});

export { register };
