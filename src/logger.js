import pino from 'pino';

// Pino keeps the same log shape/level the service emitted under Fastify; the
// pretty transport is dev-only so production stays newline-delimited JSON.
export function createLogger(level) {
    return pino({
        level,
        transport: process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined
    });
}
