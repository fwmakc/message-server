FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# --- Runner ---

FROM node:18-alpine AS runner

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY views/ ./views/

ENV NODE_ENV=production
ENV ROOT_PATH=.
EXPOSE 3003

CMD ["node", "dist/main"]
