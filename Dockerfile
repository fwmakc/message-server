FROM node:18-alpine AS builder

WORKDIR /app

COPY message-server/package*.json ./
RUN npm install --legacy-peer-deps --ignore-scripts

COPY api-server-toolkit/dist ./node_modules/api-server-toolkit/dist
COPY api-server-toolkit/src ./node_modules/api-server-toolkit/src
COPY event-server/dist/contracts ./node_modules/event-server/dist/contracts
COPY event-server/package.json ./node_modules/event-server/package.json

COPY message-server/ .
RUN npx tsc -p tsconfig.build.json

# --- Runner ---

FROM node:18-alpine AS runner

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY message-server/views/ ./views/

ENV NODE_ENV=production
ENV ROOT_PATH=.
USER node
EXPOSE 3003
HEALTHCHECK --interval=10s --timeout=3s --retries=5 --start-period=15s \
  CMD wget -qO- http://localhost:3003/health || exit 1

CMD ["node", "-r", "tsconfig-paths/register", "dist/main"]
