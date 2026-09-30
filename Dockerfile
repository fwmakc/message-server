FROM node:24-alpine AS builder

WORKDIR /app

COPY message-server/package*.json ./
# Install against local stubs instead of the git-pinned toolkit and event
# contracts: npm "prepares" git deps by installing their whole devDependency
# tree from the registry just to run `prepare` — slow and network-flaky — and
# reifies stale git entries from the lockfile even after package.json changed.
# Both files are rewritten here; the real packages are copied into
# node_modules right after the install.
RUN mkdir -p toolkit-stub contracts-stub \
    && node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));p.dependencies['api-server-toolkit']='file:./toolkit-stub';p.dependencies['event-server']='file:./contracts-stub';fs.writeFileSync('package.json',JSON.stringify(p,null,2));const l=JSON.parse(fs.readFileSync('package-lock.json','utf8'));for(const k of ['node_modules/api-server-toolkit','node_modules/event-server']){delete l.packages[k];}if(l.dependencies){delete l.dependencies['api-server-toolkit'];delete l.dependencies['event-server'];}fs.writeFileSync('package-lock.json',JSON.stringify(l,null,2))" \
    && echo '{"name":"api-server-toolkit","version":"0.0.0-stub","dependencies":{"@supercharge/request-ip":"*","prom-client":"*"}}' > toolkit-stub/package.json \
    && echo '{"name":"event-server","version":"0.0.0-stub"}' > contracts-stub/package.json
RUN --mount=type=cache,target=/root/.npm npm install --legacy-peer-deps --ignore-scripts --install-links \
  --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 --fetch-timeout=600000

RUN rm -rf node_modules/api-server-toolkit node_modules/event-server
COPY api-server-toolkit/package.json ./node_modules/api-server-toolkit/package.json
COPY api-server-toolkit/dist ./node_modules/api-server-toolkit/dist
COPY api-server-toolkit/src ./node_modules/api-server-toolkit/src
COPY event-server/dist/contracts ./node_modules/event-server/dist/contracts
COPY event-server/package.json ./node_modules/event-server/package.json

COPY message-server/ .
# Incremental tsbuildinfo from the host would make tsc skip emission
RUN rm -f *.tsbuildinfo && npx tsc -p tsconfig.build.json

# --- Runner ---

FROM node:24-alpine AS runner

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
  CMD wget -qO- http://127.0.0.1:3003/health || exit 1

CMD ["node", "-r", "tsconfig-paths/register", "dist/main"]
