# Container deployment

The root Dockerfile packages the existing CMS and public renderer as one
independent Node.js 24 service. It does not introduce another content authority
or bundle any site's content. CI builds the image and checks native module
loading as a non-root user. It does **not** publish a registry tag or deploy it.

## Build and runtime boundary

- Build on CI/an approved builder, then publish the reviewed image to the chosen
  registry and record its immutable digest. Production only pulls that digest.
- The closed `.dockerignore` excludes databases, uploads, environment files,
  key material, local overrides, and mutable installation/registry state.
- GitHub CI runs the authoritative full-tree dependency audit before an image is
  eligible for deployment. The registry builder installs the reviewed lockfile
  with `npm ci --no-audit`, so an unavailable npm advisory endpoint cannot make
  an otherwise reproducible regional image build fail. Operators must verify the
  matching CI result before deploying the tag. The multi-stage build bundles
  browser assets; the final image contains production dependencies, not the
  build toolchain.
- SQLite and bcrypt are installed for the Linux image, never copied from the
  host's `node_modules`. Node.js 24 is required by the supported image.
  Both stages use Debian Trixie: the SQLite 6 Linux prebuild needs glibc 2.38
  or newer and does not load on Bookworm's older libc. CI's final-image native
  load check is mandatory; a successful Docker build alone misses that mismatch.
- No build arguments accept secrets. Inject production configuration at runtime
  through the deployment system, outside Git and the build context.

### Reviewed base-image mirrors

Both stages use the single global `NODE_IMAGE` build argument. Its default is
the official Node 24 Trixie Slim image pinned by OCI index digest. An approved
builder may set `NODE_IMAGE` to an accessible mirror of that exact image when
Docker Hub is unreachable. Verify the official and mirror index digests and
the target platform manifest before using the override; retain the digest in
the supplied reference. Never substitute Bookworm, Alpine, an unverified image,
or an unpinned tag to work around a network failure. Keep site-specific registry
settings in the deployment system, not this generic source repository.

The reviewed index on 2026-09-03 is
`sha256:50c3b2f6988dfc307b86e5301d69611af31f4789bdf232863b07d3b02fe55ae0`;
its Linux AMD64 manifest is
`sha256:a747ad80c8a161b650d79a6da9c422005b91148b18b8d2c669eb5a0b7c07e600`.
Refreshing this pin is a separate reviewed update. A manifest check proves
image identity, not build-network reachability or the final CMS runtime.

## Required deployment configuration

1. Set `PUBLIC_URL` and `APP_BASE_URL` to the approved HTTPS origin, plus all
   secrets/salts and the admin iframe RSA pair from [Security Notes](security.md).
   Do not reuse development credentials or another application's users/secrets.
2. Keep both `APP_ENV=production` and `NODE_ENV=production`. Keep auto-login,
   agent development login, weak credentials, file debug logs and reload disabled.
3. Persist `/app/data` and `/app/library` with permissions for UID/GID 1000.
   The data volume owns SQLite files plus `install.lock`, `modulePasswords.json`
   and `placeholderData.json` through container-only symlinks. When importing an
   existing installation, copy those three files into the data volume along with
   a consistent database backup; do not copy a live SQLite file without its WAL.
4. Terminate TLS at the established proxy. Do not expose port 3000 publicly.
   Set `TRUST_PROXY` to that proxy's verified IP/CIDR only, never a broad public
   network. The proxy must overwrite forwarded headers. Complete initial setup
   privately before exposing the public host.
5. Pin one replica for SQLite. Do not share a SQLite volume across containers.
   Use the existing database adapter configuration if an external database is
   deliberately selected; no database-engine migration is implied here.

This image treats extension code as part of the reviewed image. Install/update
modules, apps and widgets in the source/build workflow, not the disposable
container filesystem. Content and media editing remain normal CMS operations.
Git-managed frontend customizations may be mounted read-only at the canonical
`/app/data/module-overrides` path; do not mount over managed application or
module code. The supplied `deploy/blogposter.compose.yml` keeps that overlay,
the private database volume and media volume separate.

## Verification and rollback gates

The image healthcheck proves the listener is available after module bootstrap;
an HTTP-to-HTTPS redirect is an expected result. It is **not** database readiness.
Before a public cutover, verify the real HTTPS origin, login, an authorized
content save/read/reload, nested public pages, and public media. Back up both
volumes and secrets, restore to an isolated instance, and verify the same paths.
Record the image digest and keep the prior image, matching data backup and proxy
configuration. Image creation alone is not a production-ready/live claim.

The supported core update and automatic rollback procedure is documented in
[Safe core updates](core-updates.md). It replaces the full image by immutable
digest, never individual application files.
