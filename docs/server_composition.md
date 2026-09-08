# Server Composition

`app.js` is the process entry point only. It loads `.env`, checks required
secrets, attaches global error handling, creates the development file logger,
starts the Express app and wires shutdown handlers.

The runtime host is composed in `mother/server/createBlogposterApp.js`.
Composition order is explicit because Express route order is security-relevant:

1. Static and runtime asset routes.
2. Security middleware, body parsing and cookies.
3. Core module bootstrap and optional module loading.
4. HTTP routers for Meltdown, auth, app management and agent APIs.
5. Admin shell routes.
6. First-run install routes.
7. Maintenance middleware.
8. Public page rendering.
9. First-install state reconciliation.

## Ownership

- `mother/server/http/staticAssets.js` owns asset serving, static realpath
  guards and TypeScript source blocking.
- `mother/server/http/runtimeBrowserModules.js` serves allowlisted browser
  modules from the adjacent JavaScript output of `npm run build:browser` in
  production (`NODE_ENV=production` or `APP_ENV=production`). The image build
  already runs this step before pruning development dependencies. Missing output
  raises `BROWSER_MODULE_BUILD_MISSING`; there is no runtime compiler fallback.
  Development loads TypeScript only on the first matching request and retains
  source-mtime caching. TypeScript is a development dependency.
- `mother/server/http/securityMiddleware.js` owns trust proxy, Helmet, HTTPS
  redirect, body parsing and cookies.
- `mother/server/bootstrap/*` owns core module token issuance and module
  startup order.
- `mother/server/http/*Routes.js` files own Express transport adapters only.
  They translate HTTP requests to existing module events and services.
- `mother/modules/*` continues to own CMS behavior, data contracts and
  permission checks.

Database engines remain selected by the existing `CONTENT_DB_TYPE` configuration.
The engine factory loads and caches only the selected engine through Node's module
cache. Database creation uses that same engine; PostgreSQL setup and MongoDB
ObjectId helpers load their drivers only within the corresponding database path.
All three drivers remain installed so supported database choices remain available.
These loading changes do not establish a measured production memory saving.

## Admin loading feedback

`public/admin.html` includes the shared `bp-loader--skeleton` markup for header,
navigation, sidebar and content before JavaScript executes. The small
`ui/shell/entries/adminShellLoading.ts` entry starts a 30-second watchdog independently
of the renderer/token graph. `ui/shared/feedback/adminShellLoading.ts` owns the DOM
loading lifecycle (`data-admin-loading`, `aria-busy`) and searchable
`ADMIN_SHELL_*` errors. A failed or timed-out region offers **Erneut versuchen**;
the link reloads the current authenticated route and discards unfinished requests.

The renderer starts content feedback before page discovery. Content navigation
preserves header/navigation nodes, and widget grid mounting hands off to the
existing individual widget placeholders. The independent shell partials load in
parallel and finish individually; workspace navigation keeps its placeholder until
the existing authorized page-list request completes. Ready navigation stays usable
during content changes. This improves visible loading and removes the serial
partial-fetch chain; it does not establish an end-to-end backend latency saving.

## Rules For New Work

Do not add new route implementations directly to `app.js`. Add a focused file
under `mother/server/http/` and mount it from `createBlogposterApp.js`.

Do not move business logic into server composition files. If a behavior belongs
to a module, keep it in `mother/modules/*` and expose it through an event,
facade or existing module service.

When route order matters, update `tests/serverComposition.test.js` or the
route-specific boundary test so the ordering remains explicit.
