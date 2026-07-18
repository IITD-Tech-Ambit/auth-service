import express from 'express';
import cookieParser from 'cookie-parser';
import Redis from 'ioredis';
import { MongoClient } from 'mongodb';
import 'dotenv/config';

import config, { validateConfig } from './config.js';
import { createLogger } from './logger.js';
import IitdOAuthClient from './adapters/iitdOAuthClient.js';
import RedisStateStore from './adapters/redisStateStore.js';
import MongoUserRepository from './adapters/mongoUserRepository.js';
import JwtTokenIssuer from './adapters/jwtTokenIssuer.js';
import AuthFlow from './services/authFlow.js';
import authRoutes from './http/routes.js';
import healthRoutes from './http/healthRoutes.js';
import { startGrpcServer } from './grpc/server.js';
import { metricsMiddleware, metricsRouter } from './metrics.js';

// Composition root: construct every adapter once and inject.
async function start() {
    const logger = createLogger(config.logLevel);

    validateConfig(config, logger);

    const mongoClient = new MongoClient(config.mongo.uri);
    await mongoClient.connect();
    const mongoDb = mongoClient.db();
    const redis = new Redis(config.redis.url, { lazyConnect: false });

    const userRepository = new MongoUserRepository(mongoDb.collection(config.mongo.usersCollection));
    await userRepository.ensureIndexes();

    /** @type {import('./ports/ports.js').AuthApplication} */
    const auth = new AuthFlow({
        oauthProvider: new IitdOAuthClient(config.oauth, logger),
        stateStore: new RedisStateStore(redis, config.oauth.stateTtlSec),
        userRepository,
        tokenIssuer: new JwtTokenIssuer(config.session),
        logger
    });

    const app = express();
    app.disable('x-powered-by');
    app.use(metricsMiddleware);
    app.use(express.json());
    app.use(cookieParser());
    app.use(metricsRouter);
    app.use(authRoutes({ auth, config, logger }));
    app.use(healthRoutes({ mongoDb, redis }));

    const grpcServer = await startGrpcServer({
        auth,
        bindAddress: config.grpc.bindAddress,
        logger
    });

    const server = app.listen(config.port, config.host, () => {
        logger.info(`auth-service running on http://${config.host}:${config.port}`);
    });

    const signals = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
        process.on(signal, () => {
            logger.info(`Received ${signal}, shutting down...`);
            grpcServer.tryShutdown(() => {});
            server.close(async () => {
                await mongoClient.close();
                redis.disconnect();
                process.exit(0);
            });
        });
    }

    server.on('error', (error) => {
        logger.error(error);
        process.exit(1);
    });
}

start();
