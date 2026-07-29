FROM node:18-alpine AS builder

WORKDIR /app

COPY message-server/package*.json ./
RUN npm install --legacy-peer-deps

# Override toolkit with local changes (queue module)
COPY api-server-toolkit/dist ./node_modules/api-server-toolkit/dist
COPY api-server-toolkit/src ./node_modules/api-server-toolkit/src

COPY message-server/ .
RUN npx tsc -p tsconfig.build.json

# --- Runner ---

FROM node:18-alpine AS runner

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/views/ ./views/

ENV NODE_ENV=production
ENV ROOT_PATH=.
EXPOSE 3003

CMD ["node", "-r", "tsconfig-paths/register", "dist/main"]
