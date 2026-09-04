# Build only in CI or on an approved builder; production pulls a reviewed image.
# SQLite 6 Linux prebuilds require glibc >= 2.38; Debian Trixie supplies 2.41.
# A reviewed mirror may override the registry, while retaining this official digest.
# Keep one base for both stages so native modules see the same Node/libc runtime.
ARG NODE_IMAGE=docker.io/library/node:24-trixie-slim@sha256:50c3b2f6988dfc307b86e5301d69611af31f4789bdf232863b07d3b02fe55ae0
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
# GitHub CI is the authoritative full-tree audit gate. Keep the registry build
# deterministic and independent of npm's advisory endpoint, which is not needed
# to install the reviewed lockfile and can be unreachable from regional builders.
RUN npm ci --no-audit
COPY . .
RUN npm run build \
    && npm prune --omit=dev

# Branch CI exercises the non-deployable build stage without release signing.
# Only a tag release with externally signed inputs can produce the final image.
FROM build AS verified-build
RUN node tools/verify-runtime-integrity-baseline.js .release-integrity/runtime-integrity-manifest.json \
    && rm -rf /app/.release-integrity /app/tools

# The runtime and host updater deliberately use the same GitHub/Sigstore
# verifier. Pin and checksum the public CLI binary; no private signing key is
# ever copied into the image.
FROM ${NODE_IMAGE} AS github-cli
ARG TARGETARCH
ARG GH_VERSION=2.96.0
RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates curl \
    && case "$TARGETARCH" in \
         amd64) GH_SHA256='83d5c2ccad5498f58bf6368acb1ab32588cf43ab3a4b1c301bf36328b1c8bd60' ;; \
         arm64) GH_SHA256='06f86ec7103d41993b76cd78072f43595c34aaa56506d971d9860e67140bf909' ;; \
         *) echo 'RUNTIME_INTEGRITY_GH_ARCH_UNSUPPORTED' >&2; exit 1 ;; \
       esac \
    && curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
         --output /tmp/gh.tar.gz "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${TARGETARCH}.tar.gz" \
    && echo "${GH_SHA256}  /tmp/gh.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/gh.tar.gz --strip-components=2 -C /usr/local/bin \
         "gh_${GH_VERSION}_linux_${TARGETARCH}/bin/gh" \
    && gh version \
    && rm -rf /var/lib/apt/lists/* /tmp/gh.tar.gz

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production APP_ENV=production PORT=3000 \
    CONTENT_DB_TYPE=sqlite SQLITE_STORAGE=/app/data \
    DEV_AUTOLOGIN=false DEV_AGENT_LOGIN=false BLOGPOSTER_DEV_RELOAD=false \
    DEV_FILE_LOGS=false BLOGPOSTER_EVENT_TRACE=false \
    BLOGPOSTER_RUNTIME_INTEGRITY=required
WORKDIR /app
# Core code and the verifier stay root-owned and read-only to the unprivileged
# application user. Only explicit data directories become writable below.
COPY --from=verified-build /app /app
COPY --from=github-cli /usr/local/bin/gh /usr/local/bin/gh
COPY .release-integrity/runtime-integrity-manifest.json /app/.integrity/runtime-integrity-manifest.json
COPY .release-integrity/runtime-integrity-manifest.bundle.json /app/.integrity/runtime-integrity-manifest.bundle.json
COPY .release-integrity/runtime-integrity-trusted-root.jsonl /app/.integrity/runtime-integrity-trusted-root.jsonl
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
# The listener starts only after module bootstrap; the bounded readiness route
# also exposes the packaged version so the external updater can verify cutover.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e "const r=require('http').get('http://127.0.0.1:3000/health/ready',s=>{let b='';s.on('data',c=>b+=c);s.on('end',()=>{try{const j=JSON.parse(b);process.exit(s.statusCode===200&&j.code==='BLOGPOSTER_READY'&&j.status==='ready'?0:1)}catch{process.exit(1)}})});r.on('error',()=>process.exit(1));r.setTimeout(4000,()=>{r.destroy();process.exit(1)})"
CMD ["node", "app.js"]
