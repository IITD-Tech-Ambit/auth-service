# auth-service — IITD OAuth identity service (Express + gRPC)
# Build context is the workspace root so /protos can be copied in:
#   docker compose builds with context: . , dockerfile: auth-service/Dockerfile
FROM node:20-alpine

# Build-only proxy for npm, plus auth for the private @iitd-tech-ambit GitHub
# Packages registry (@iitd-tech-ambit/protos). Runtime proxy for
# oauth.iitd.ac.in comes from docker/proxy.env via compose — do not bake
# HTTP_PROXY or the package auth token into the image.
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NODE_AUTH_TOKEN

WORKDIR /app

COPY auth-service/package*.json auth-service/.npmrc ./
RUN npm install --omit=dev

COPY auth-service/src ./src

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 4000 50051

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

CMD ["node", "src/server.js"]
