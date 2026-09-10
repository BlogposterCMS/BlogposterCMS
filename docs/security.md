# Security Notes

## ACR source builds

The canonical Dockerfile accepts complete externally signed CI inputs or obtains
the exact packaged release's manifest and detached bundle from the fixed official
repository. Missing/partial inputs, wrong versions, invalid attestations and build
hash mismatches stop the image build. Downloaded manifests cannot supply their own
trust roots: the pinned gh verifier exports roots using its existing TUF policy.
The same verifier checks repository, release workflow, tag and source commit.
No signing key enters ACR and no local signature or unsigned baseline is generated.
Runtime verification, module package signatures and the reviewed registry-mirror
policy remain unchanged. See [core updates](core-updates.md).

## Signed core module updates

Authentication routes distinguish CORE_MODULE_UPDATING from invalid credentials.
A paused dependency returns HTTP 503 with Retry-After and retains the existing
session cookie; no request gains authorization while validation is unavailable.
Batch responses preserve per-item outcomes so completed mutations are not retried
as a whole. Invalid tokens still follow the existing rejection/clearing path.


Media routes retain their existing authentication, permission and CSRF middleware
inside a generation-owned router. A stable host mount selects the active router;
the updater never removes or rewrites the host's Express stack. Matching new
requests receive `CORE_MODULE_UPDATING` while existing responses and async handlers
drain. Candidate readiness and method/path equality are required before activation.
Designer preparation cannot mutate shared database placeholder registration.
Per-module release notes are bounded text signed with the candidate manifest;
they are not executable markup or a declaration of additional update permissions.

Core listener scopes forward emission through the original authenticated
MotherEmitter. They grant no additional permissions. The generation loader is
for trusted core code only and is not a sandbox. The existing administrator-only
Updater verifies official release-workflow attestations, exact package bytes and
host compatibility before loading a generation. A fixed host policy controls
which modules qualify; callers cannot provide URLs, paths or source code.
The active code selection is atomic and reverified on startup. An ambiguous
activation-worker failure requires recovery rather than an unsafe rollback.
Shared runtime, dependencies and schema changes retain the signed host-release
boundary. See [independent core module updates](core-module-updates.md) for scope,
recovery and the distinction between local fixtures and production acceptance.

## UI-installed community packages

ZIP inspection never executes package code. Package size, decompression size,
entry count, traversal, duplicate/case-colliding names, symlinks and mixed package
types are checked. Confirmation is bound to the ZIP SHA-256. SHA-256 binds bytes;
it does not establish publisher identity or prove absence of malware.

Community code now uses the mandatory isolation contract described in
[Community isolation and migration](community-isolation.md). Modules run only in
Linux namespaces with read-only package code, no host secrets/data/network and a
seccomp process/socket policy. Widgets run in opaque-origin workers with a
bounded UI tree and service bridge. Core/bundled product code remains trusted.
There is no ordinary Node or same-document community execution fallback.
The runner exposes no procfs and cannot create further namespaces, including
through clone flags. Docker deployments use the narrowly extended Moby profiles
documented in the isolation guide; the outer container retains no capabilities,
no-new-privileges and its default masked/read-only paths. Never apply these
profiles globally or use them without the mandatory inner runner filter.

The module registry and Settings Manager remain the access authorities. Only
installer/host code writes packages and approval receipts. Hashes bind reviewed
bytes but do not establish publisher identity. Operator/host compromise and
kernel/browser vulnerabilities remain outside the extension access guarantee.
Browser resource exhaustion remains a limitation; do not claim absolute malware
prevention. Existing packages and data are retained on incompatible upgrades.

## Public static compression and HTML handoff

Only successful public CSS, JavaScript and SVG responses are eligible for the
standard compression middleware. Dynamic HTML with nonce/token data, JSON APIs,
errors, binary downloads and Range requests are excluded. Existing media realpath
and source-file guards remain authoritative; no new file route/cache is added.
The middleware retains Accept-Encoding negotiation and no-transform handling.

Bootstrap version 2 references only the sanitized initial HTML node for that
response. The client validates route/language and requires that node before
restoring the existing HTML descriptor in memory. Missing nodes and old clients
fall back to the canonical public envelope. Canonical content, preview handling,
script nonce checks and the response's no-store policy remain unchanged.

## Shared charts and previews

Charts accept bounded data, use canvas-rendered tooltips and expose no HTML,
remote symbols or raw engine options. The pinned local ECharts artifact is
checked at build time and with browser SRI. This detects changed bytes, not all
malware; review limits and update procedure are in [shared visuals](shared-widget-visuals.md).
The shared DOM capture preserves the Designer's existing media/permission flow;
it does not add a server-side URL fetch or a Chromium service.

## Analytics

Website collection now defaults off. SettingsManager validates the atomic
public-safe consent configuration, including fixed provider IDs and bounded
lifetimes. No secret or executable URL is accepted there. Consent cookies are
untrusted preferences; correlation UUIDs never grant authority. Account IDs are
copied only from the existing validated user principal with explicit recognition
consent. DNT/GPC and disabled consent/collection suppress optional recording.
Consent withdrawal stops future collection and reloads the page; retained history
expires under the existing 60-day policy. The banner cannot intercept arbitrary
custom HTML scripts; their owners must integrate the consent lifecycle.

GA4 is disabled and explicitly untested for live ingestion. Basic-mode loading
requires explicit analytics consent; the nonce authorizes only the configured
fixed Google script URL. Advertising signals remain denied. GeoIP belongs to
`geoipManager`, with server-only credentials and an operator-provided database
or a RequestManager allowlisted HTTPS service. No raw IP is retained by Analytics;
external GeoIP lookup transmits the IP only after explicit analytics consent.
The internal GeoIP event requires a verified registered core-module principal and
rejects external/user/public calls. Existing outbound DNS/SSRF restrictions remain
unchanged, including for self-hosted services.

`analytics.summary` requires `analytics.read` at the existing admin facade and
module boundary. There is no public analytics-read or arbitrary collection API.
The authenticated emitter observer copies only allowlisted labels and verified
principal IDs; it never persists payloads or secrets. Public delivery analytics
omit raw IP/UA, cookies and URL queries, respect DNT/GPC, and exclude previews.
UA/referrer metadata is untrusted and never used for authorization. UI labels
are rendered as text. Fixed DatabaseManager placeholders bind all values, use
idempotent writes, prune after 60 days and bound reads/queues. Analytics is
operational telemetry, not a complete or tamper-proof audit trail. See
[measurement limits](analytics.md).

## Bundled documentation example

`exampleSite` runs through the existing Importer facade and domain events. It
accepts only the bundled `docs` ID, a bounded lowercase root slug and a boolean
dry-run option. It reads only repository-owned template files, never caller
paths, packages or scripts. `importers.run`, Pages read/create, Designer save
and Navigation manage permissions remain authoritative. Existing addresses and
menu sources are checked before writes; pages and design start as drafts. A
partial cross-domain failure reports created IDs without automatic deletion.

## Public breadcrumbs

Breadcrumb title/ancestor reads use `cmsPublicRuntimeRequest` with the public
principal; Studio admin credentials are never substituted. The public Pages
filter remains authoritative. Rendering stops at unpublished/non-public parents,
with a visited-ID set and depth limit of 16. Failed reads retain a URL-only trail.
Menu and breadcrumb links still pass the shared URL normalizer.

## Website main design

`SITE_MAIN_DESIGN_ID` is a public non-secret Settings value. Writes retain
`settings.core.edit` and validate a published Designer layout with exactly one
page-content area. Pages stores only its composition mode and own design id.
The existing public facade filters both outer and inner designs; composition
never substitutes admin credentials. Fixed design references and dynamic page
composition share the renderer's branch-local recursion guard. Failed nested
composition preserves the independently sanitized page body.

## Measured HTML imports

`htmlPage` accepts bounded capture JSON through existing `importers.run`
permissions. The backend does not fetch URLs, run source scripts, read arbitrary
files or install fonts. The separate local export CLI renders an explicitly
selected URL in a browser session. Imported markup passes the installed HTML
parser/sanitizer and computed CSS property allowlist before Designer's normal
save sanitization. Script/event attributes, executable URL schemes, CSS escapes,
comments and arbitrary selectors are excluded. Unknown behavior is reported.
Designer saves now retain safe images/buttons, the `editable` hook and generated
`bp-import-node-*` classes; arbitrary source classes remain stripped. Public
sanitization and draft/publication permissions are unchanged.
Structural captures are bounded to 500 nodes and reject cycles, missing parents,
cross-Section ownership and ownership changes between captured widths.

## Shared widget rendering

Studio now uses the same allowed widget module loader and HTML sanitizer as
the catalog and public runtime. The shared module lifecycle does not choose
credentials or grant permissions: runtime context still excludes `ADMIN_TOKEN`
from public widgets. Inline scripts retain the existing nonce-aware executor;
the runtime retains its Shadow DOM isolation. No new trust flag or API is added.

## Widget API metadata

`metadata.apiActions` describes dependencies; it never grants runtime permissions.
Renderers no longer issue the unimplemented `widgets.registerUsage` startup call,
and the facade no longer advertises that action. Admin reads/writes and public
reads still use their existing Runtime Manager principal, scope, permission and
published-data checks. No registration ACK, permission grant or alternate API
has been introduced. Deploy the updated browser bundles with the facade change.

## Initial public presentation

The public page route resolves pages, envelopes and linked layouts through
`cmsPublicRuntimeRequest` using a validated public principal. Publication/lane
filtering remains in Runtime Manager; admin cookies cannot select drafts for
the initial response. Pages Manager's `publicPresentation.js` renders only that
public result. It uses the installed HTML sanitizer, removes active HTML/event
attributes, restricts URL schemes and applies the existing shared CSS policy.
Authored scripts remain on the client nonce-controlled execution path.

All bootstrap values escape HTML-significant characters before entering the
nonce-bearing script. The initial DOM has reserved ownership markers for client
adoption; stale pathname/language handoffs discard their owned nodes before CSR.
Responses carry `Cache-Control: no-store` because they contain a short-lived
public token and fresh nonce. No new endpoint, admin token or cache authority is
introduced. Signed Designer Live Preview bypasses initial public presentation
and continues to require the existing verified origin token and parent bridge.

## Dependency security baseline

The supported CI/container runtime is Node.js 24. Keep the full-tree
`npm audit --audit-level=high` gate in GitHub CI; development/build dependencies
are not excluded. Registry image builds install the same reviewed lockfile with
`npm ci --no-audit` and are deployable only after that CI gate passes. This avoids
making a regional builder depend on npm's advisory endpoint without weakening
the release decision. The September 2026 remediation refreshes the lockfile and
upgrades ZIP/native installer dependencies without replacing Express 4 routes, SQLite
authority, or the existing bcryptjs login implementation. Scoped `qs` 6.16.0
overrides for Express/body-parser bridge their older minor-range constraints;
remove them only when the upstream ranges admit a fixed parser and tests pass.
Regression coverage includes forged ZIP size allocation, ordinary ZIP reads,
native hash interoperability, HTTP query/form parsing and SQLite content saves.

The upstream `sqlite3` repository is archived. Its patched 6.0.1 dependency is
a bounded remediation, not a long-term support guarantee. Track maintenance
separately; replacing the database adapter requires its own compatibility,
backup/restore and cutover decision. Container isolation and deployment gates
are documented in [Container deployment](container-deployment.md).

Agent access codes are one-time, short-lived and exchanged for least-privilege
`agent` tokens. The localhost dev-session helper is disabled in production and
can be disabled locally with `DEV_AGENT_LOGIN=false`.

BlogposterCMS was designed with multiple layers of security in mind. While no system is entirely foolproof, following these guidelines will help keep your installation safe.

- **Environment secrets** – Never commit real secret values to version control. Copy `env.sample` to `.env` and provide strong random strings for all salts and tokens.
 - **HTTPS** – When running in production, place the app behind HTTPS and set `APP_ENV=production` (or `NODE_ENV=production`) to enable secure cookies and redirects.
- **Rate limiting** – `config/security.js` sets limits for login attempts and meltdown API calls. Tune these using `LOGIN_LIMIT_MAX` and `API_RATE_LIMIT_MAX` if needed.
- **Weak credentials** – Logins and first-install passwords under 12 characters are only accepted from local non-production requests while `DEV_AUTOLOGIN` is enabled or `ALLOW_WEAK_CREDS=I_KNOW_THIS_IS_LOCAL` is set. Production startup aborts if a user named `admin` or a short password is detected.
- **CSRF protection** – Admin routes use CSRF tokens to prevent cross-site request forgery. Clients must include the token when authenticating or performing sensitive actions.
- **Community isolation** - See [the enforced runtime contract and migration requirements](community-isolation.md). Ordinary child processes alone are not an untrusted-code sandbox.
- **JWT event bus** – All internal actions pass through the meltdown event bus. Each event carries a signed token and is validated before execution to prevent unauthorized operations. HTTP-exposed direct events are additionally selected from executable backend contracts with payload/result schemas and bounded deadlines. Contract validation is defense in depth and never replaces JWT, permission, app-manifest or module-host checks.

- **HTTP security headers** – Configure a Content-Security-Policy and other headers (using middleware such as `helmet`) to protect against common attacks like XSS and clickjacking.
- **Session management** – Keep JWT secrets private and rotate them periodically. Tokens should expire after a reasonable time, especially for admin accounts.
- **Dependency audits** – Run `npm audit` regularly and update packages when security fixes are published. Review third‑party modules before enabling them.
- **Database privileges** – Create database users with only the permissions they need and restrict remote access where possible.
- **Monitoring and logs** – Record login attempts and important actions. Reviewing logs helps detect suspicious behavior early.

- **Content sanitization** – Design content is sanitised both when it is saved server-side and again when it is rendered in the browser. Public pages retain `<style>` tags while stripping scripts and unsafe CSS patterns (like `expression` or URLs using `javascript:` or `data:`) so designs render without enabling script injection.
- **Public media boundary** – `/media/...` serves only files already stored
  below Media Manager's `library/public` directory. Requests pass through a
  realpath containment guard and reject TypeScript sources, secret-shaped
  filenames and package manifests before static delivery.
- **Public nested-page boundary** – Catch-all public page routes retain all
  pathname segments only after the existing slug sanitizer has normalized and
  length-limited them. The server renders only a matching published page;
  unknown nested paths continue to the normal not-found handler.
- **Custom design scripts** – Runtime rendering only executes design-supplied JavaScript when the payload carries an explicit trust flag (such as `allowCustomJs`). Only literal boolean `true`, `1` or the string equivalents `'true'`, `'1'`, `'yes'`, `'y'` or `'on'` are treated as trusted so stringified falsy values remain blocked. Restrict that capability to trusted authors via permissions or workflow reviews and audit designs regularly.

Always review your access logs and keep dependencies up to date. Security patches will continue to harden the platform over time.

## Admin iframe origin whitelist

The admin dashboard loads apps such as the designer inside an `<iframe>` and exchanges data via `postMessage`. To stop hostile pages from injecting commands, define the set of trusted parent origins in `config/security.js` or via the `APP_FRAME_ALLOWED_ORIGINS` environment variable. Multiple origins can be supplied as a comma-separated list (for example `https://admin.example.com,https://staging-admin.example.com`).

At startup the CMS now requires an RSA key pair for iframe origin tokens. Provide the PEM-encoded values through the environment:

- `APP_FRAME_ORIGIN_TOKEN_PRIVATE_KEY` – PKCS#8 private key
- `APP_FRAME_ORIGIN_TOKEN_PUBLIC_KEY` – SPKI public key

Startup aborts if either value is missing so deployments cannot fall back to an insecure development key. A short-lived, signed token that encodes the allowed origins is delivered to the iframe via the query string, and the designer downloads the matching public key from `/apps/designer/origin-public-key.json` before verifying the signature with the WebCrypto API. Only when the signature, referrer origin, and `postMessage` source all match the configured whitelist will the iframe accept admin tokens.

Origins reported as `null` (from sandboxed or `about:blank` documents) or using non-HTTP(S) schemes remain blocked even if the origin token lists them.

Sandboxed apps that need small browser-local UI preferences use the existing
request/response AppBridge events `appPreference.get` and
`appPreference.set`. The dashboard validates the key, limits serialized values
to 4096 bytes and stores them below an app-specific namespace. The child never
receives raw `localStorage` access and cannot select another app's namespace.
These preferences are non-sensitive UI state only; tokens, permissions and
server-owned settings must not use this contract.

The same signed token authorizes the nested Design Studio Live Preview without
weakening the outer app-frame sandbox. Designer forwards `originToken` to the
normal public page route only with `designer-live-preview=1`. The server
verifies the RSA signature, issue/expiry timestamps and configured origin scope
before removing `X-Frame-Options: SAMEORIGIN` for that one response. Invalid or
expired requests fail closed with
`DESIGNER_LIVE_PREVIEW_ORIGIN_TOKEN_*`, keep the frame header and use
`Cache-Control: no-store`. Maintenance middleware lets these requests reach
the public-route verifier without redirecting or stripping the signed query;
ordinary public requests still follow the configured maintenance page. Never
add `allow-same-origin` to the admin app iframe as a Preview workaround.

For local development you can generate a key pair with:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out origin-token-private.pem
openssl rsa -in origin-token-private.pem -pubout -out origin-token-public.pem
```

Paste the PEM strings (with newline escapes) into your `.env` file before starting the server.

## Troubleshooting Secure Login

When `APP_ENV=production` (or `NODE_ENV=production`) is set, the `admin_jwt` cookie is marked as `secure`.
Browsers will only store this cookie over HTTPS connections. If you access the
admin interface using plain HTTP, the login page may simply reload without an
error because the cookie is ignored. Either use HTTPS (for example via a local
reverse proxy) or unset `APP_ENV`/`NODE_ENV` while testing locally.

## Module Update Supply Chain

Community module updates are downloaded only from the configured
`trustedUpdateSource`, currently GitHub releases. Publish a ZIP plus SHA-256
sidecar for every release and configure a public signing key when possible.
The updater validates the package with the installer policy, blocks downgrades
and module-name mismatches, requires admin review for new core access, runs the
health check before swapping folders and keeps a backup for rollback.

## Core Update Supply Chain

The optional host update agent is a new, explicitly authorized CMS-to-host
control boundary. Runtime Manager's `coreUpdates.status/check/install` actions
require `settings.core.edit`; Module Loader owns the event handlers. Notification
visibility is decided from the original verified caller before its JWT is
replaced by a service JWT. Browser flags cannot grant update visibility.

Only the CMS backend receives a read-only directory mount containing a Unix
socket (0660, dedicated supplementary group). No TCP control listener, Docker
socket, host state folder or CMS runtime secrets cross this boundary. The
root-owned host service accepts three fixed operations and a bounded exact
version/image pair; it never accepts commands, configuration paths, URLs or
manual rollback requests. The existing updater re-verifies the signed candidate
and rejects target drift before image replacement. Concurrent jobs are locked;
state survives CMS restarts. Host-agent interruption fails closed and requires
operator recovery instead of automatically replaying an update.

Host adapter executables, service and Compose overlay are separately attested
by the release workflow. Provisioning verifies their bundle before installation.
The downloaded provisioning script itself must be verified before execution.
Service configuration and state remain root-owned. The dedicated socket group
must contain only the intended CMS container, not interactive untrusted users.
This grants an authorized CMS administrator the ability to restart its service
onto an approved signed stable release; it is not a general host administration API.

Core releases are complete OCI images, not file patches. The release workflow
binds the package version, source commit and immutable image digest in
`blogposter-update.json`, signs that manifest externally and publishes GitHub
build provenance. The external host updater verifies the detached manifest
attestation before trusting any update field, backs up named persistent
volumes, checks the packaged version and automatically restores the previous digest and data
when readiness fails. It never receives CMS runtime secrets and never writes
inside the running application image. See [Safe core updates](core-updates.md).

Production startup independently verifies the release's signed runtime hash
baseline before importing the event bus or module loader. Core or dependency
drift aborts startup; a changed community module is audit-logged, kept disabled
and rechecked before every module child process. The verifier is pinned to the
official repository, release workflow and exact package tag, uses the same
GitHub/Sigstore trust chain as the updater, and cannot be bypassed in
production. No private signing key or automatic local re-signing path is
shipped.

Release images also package the public GitHub/Sigstore trust roots exported by
GitHub CLI after TUF verification on the release runner. Offline verification
uses these root-owned image files, not a writable cache, runtime URL or secret.
Their trust is bound to the externally verified image digest; repository,
workflow, exact tag/commit and hosted-runner constraints still apply. Missing
packaged anchors stop startup. Release CI verifies the final image without
network access, so a detached attestation bundle cannot mask an online trust
bootstrap dependency.

Module overlays are restricted to declared static directories. Backend entry
files, module manifests, package-manager files, host folders and symlinks cannot
participate. Deploy Git-managed overlays as a read-only mount at
`/app/data/module-overrides`; never commit or expose the rest of `/app/data`.

Notification integration configuration and FileLog output are mutable private
state under `/app/data/notificationManager`. The signed registry inside
`/app/mother` is a read-only initialization default and must never be edited or
made writable in production.

## Developing Secure Modules

Individual CMS updates preserve host-owned engines, permission definitions,
revocation state, installation authorities and shared service instances. The
fixed package policy includes a projection of the canonical bundled-widget
catalog; uploaded metadata cannot create a new backend package identity.
Bundled-widget packages may contain only their declared browser entry/source,
never Node entry points. Signed asset generations retain existing public CORS
headers and sandbox permissions; shared ES imports use canonical URLs.
See [module update boundaries](core-module-updates.md) for pinned host contracts.

The Updater is a protected core module, not a community-installable package.
Its periodic checks and UI actions use the same fixed Unix-socket executor.
The combined installer stages release files in a private root-owned directory
and verifies attestations before executing them. Fresh-install secrets are
generated locally with exclusive file creation; existing credentials are never
rotated. Executor replacement acquires the existing updater lock. Readiness and
container-user socket access must pass before setup reports success.

When writing your own modules keep these best practices in mind:

1. Validate and sanitize all user-supplied data before emitting events.
2. Never trust payloads from other modules unless they include a valid JWT and the expected permissions.
3. Avoid dynamic code execution (such as `eval`) and keep your dependency list small.
4. Document the permissions your module requires in `moduleInfo.json` so administrators understand the impact.

Following these rules helps protect the entire system as it grows.

The media Explorer's directory metadata uses the existing permission-checked
folder listing. It does not follow symlinks for size/date information. Preview
URLs are limited to files already served below `library/public`; browsing or
selecting a file does not create a share or change its visibility. File mutations
acknowledge completed operations with JSON data; authorization checks are intact.

CMS workspace agents use the existing AgentManager contract. The admin facade's
`agentSurface.publish/poll/ack` adapters accept only `plainspace/cms.*` surfaces;
AgentManager enforces its existing surface-write permissions. There is no public
runtime mapping, command-enqueue shortcut, or app-context read grant for these
host adapters. Tokens/CSRF and domain write permissions remain enforced.
Only explicit non-secret form fields appear in workspace snapshots and patches.
Draft revisions and confirmation flags prevent unintended concurrent edits;
they are workflow checks, not authorization credentials. See
[agent CMS workflows](agent-cms-workflows.md) for the shared draft protocol.

Shared public layouts resolve only published public ancestors, stopping at
deleted pages, lane changes, cycles and the depth limit. The public layout
projection rejects draft designs and allowlists normalized LayoutTree fields;
nested designs continue through the existing public facade. Article HTML keeps
the established server/client sanitizer and script-nonce boundaries. Widget
imports use an absolute URL only after the existing same-origin/path allowlist.
UI-kit JSON import calls the existing Site Presets domain, which rejects code
and unknown component presets. Import does not activate site-wide styles.

### Article editor input boundary

The article dialog uses a restricted rich-text schema and removes active pasted
HTML. Agent nodes are schema-checked, bounded, and reject executable media/link
URLs. Videos are direct files rather than arbitrary iframe embeds. This is an
editing boundary, not a replacement for the existing server/public sanitizer:
Pages update permissions and public HTML sanitization remain authoritative.
Stable HTML block IDs are content identifiers, never authorization credentials.


### Resumable host image downloads

The signed manifest binds archive size, full SHA-256 and ordered chunk hashes.
Only fixed official release URLs and approved HTTPS asset redirects are accepted.
Private host cache files reject links and are rehashed before import. Cancellation
uses the existing settings.core.edit boundary and exact host job id; the host
persists its commit grant before permitting any live data change. An interrupted
post-grant job still requires recovery rather than automatic replay.
