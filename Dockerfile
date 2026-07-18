# auth-service — IITD OAuth identity service (Express + gRPC)
# Self-contained build: context is this repo's own root, so it can be built
# standalone (e.g. by Coolify, which only clones this repo) as well as from
# the vm-infra workspace root via docker-compose.
FROM node:20-alpine

# Build-only proxy for npm. Runtime proxy for oauth.iitd.ac.in comes from
# docker/proxy.env via compose — do not bake HTTP_PROXY into the image.
ARG HTTP_PROXY
ARG HTTPS_PROXY

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY protos /app/protos

ENV PROTO_DIR=/app/protos

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 4000 50051

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

CMD ["node", "src/server.js"]
