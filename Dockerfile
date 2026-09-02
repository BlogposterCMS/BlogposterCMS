# Build only in CI or on an approved builder; production pulls a reviewed image.
# SQLite 6 Linux prebuilds require glibc >= 2.38; Debian Trixie supplies 2.41.
FROM node:24-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && npm audit --audit-level=high
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-trixie-slim AS runtime
ENV NODE_ENV=production APP_ENV=production PORT=3000 \
    CONTENT_DB_TYPE=sqlite SQLITE_STORAGE=/app/data \
    DEV_AUTOLOGIN=false DEV_AGENT_LOGIN=false BLOGPOSTER_DEV_RELOAD=false \
    DEV_FILE_LOGS=false BLOGPOSTER_EVENT_TRACE=false
WORKDIR /app
COPY --from=build --chown=node:node /app /app
# Existing file-backed state follows the same persisted data volume as SQLite.
# No customer database, secrets, media or install state enters the build context.
RUN mkdir -p /app/data /app/library /app/logs /app/temp_uploads \
    && ln -s /app/data/install.lock /app/install.lock \
    && ln -s /app/data/modulePasswords.json /app/mother/modules/databaseManager/modulePasswords.json \
    && ln -s /app/data/placeholderData.json /app/mother/modules/databaseManager/placeholders/placeholderData.json \
    && chown -R node:node /app/data /app/library /app/logs /app/temp_uploads
USER node
EXPOSE 3000
VOLUME ["/app/data", "/app/library"]
# The listener starts after module bootstrap. HTTPS redirect is expected here;
# this is liveness, not a substitute for an authenticated database/readiness test.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e "const r=require('http').get('http://127.0.0.1:3000/login',s=>{s.resume();process.exit(s.statusCode>=200&&s.statusCode<400?0:1)});r.on('error',()=>process.exit(1));r.setTimeout(4000,()=>{r.destroy();process.exit(1)})"
CMD ["node", "app.js"]
