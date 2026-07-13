# auth-service — IITD OAuth identity service (Express + gRPC)
# Build context is the workspace root so /protos can be copied in:
#   docker compose builds with context: . , dockerfile: auth-service/Dockerfile
FROM node:20-alpine

ARG HTTP_PROXY
ARG HTTPS_PROXY
ENV HTTP_PROXY=$HTTP_PROXY
ENV HTTPS_PROXY=$HTTPS_PROXY

WORKDIR /app

COPY auth-service/package*.json ./
RUN npm install --omit=dev

COPY auth-service/src ./src
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
