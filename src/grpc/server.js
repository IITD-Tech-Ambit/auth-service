import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// Proto contracts come from the @iitd-tech-ambit/protos package (published
// from github.com/IITD-Tech-Ambit/proto-registry). PROTO_DIR overrides for
// local layouts that don't have it installed as a dependency.
const PROTO_DIR = process.env.PROTO_DIR ||
    path.join(path.dirname(require.resolve('@iitd-tech-ambit/protos/package.json')), 'proto');

/** Map session claims or a persisted user document onto the auth.v1 User shape. */
function toGrpcUser(source) {
    return {
        user_id: source.user_id || '',
        email: source.email || '',
        name: source.name || '',
        kerberos: source.kerberos || '',
        department: source.department || '',
        category: source.category || '',
        uniqueiitdid: source.uniqueiitdid || source.sub || ''
    };
}

/**
 * gRPC transport adapter for auth.v1.AuthService. All logic delegates to
 * AuthApplication; this file only maps proto <-> domain shapes.
 *
 * @param {{ auth: import('../ports/ports.js').AuthApplication, bindAddress: string,
 *           logger: import('pino').Logger }} deps
 */
export function startGrpcServer({ auth, bindAddress, logger }) {
    const definition = protoLoader.loadSync(
        path.join(PROTO_DIR, 'auth/v1/auth.proto'),
        { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true }
    );
    const authPackage = grpc.loadPackageDefinition(definition).auth.v1;

    const server = new grpc.Server();
    server.addService(authPackage.AuthService.service, {
        VerifyToken(call, callback) {
            const { token } = call.request;
            const result = auth.verifySession(token || '');
            if (!result.valid) {
                return callback(null, { valid: false, user: null, error: result.error || 'invalid' });
            }
            callback(null, { valid: true, user: toGrpcUser(result.claims), error: '' });
        },

        async GetUser(call, callback) {
            try {
                const user = await auth.getUser(call.request.user_id);
                if (!user) return callback(null, { found: false, user: null });
                callback(null, { found: true, user: toGrpcUser(user) });
            } catch (error) {
                callback({ code: grpc.status.INTERNAL, message: error.message });
            }
        }
    });

    return new Promise((resolve, reject) => {
        server.bindAsync(bindAddress, grpc.ServerCredentials.createInsecure(), (err, port) => {
            if (err) return reject(err);
            logger.info(`auth.v1 gRPC server listening on ${bindAddress} (port ${port})`);
            resolve(server);
        });
    });
}
