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
  guards, TypeScript source blocking and theme executable-asset blocking.
- `mother/server/http/runtimeBrowserModules.js` owns the small runtime
  TypeScript compiler used for allowlisted browser modules.
- `mother/server/http/securityMiddleware.js` owns trust proxy, Helmet, HTTPS
  redirect, body parsing and cookies.
- `mother/server/bootstrap/*` owns core module token issuance and module
  startup order.
- `mother/server/http/*Routes.js` files own Express transport adapters only.
  They translate HTTP requests to existing module events and services.
- `mother/modules/*` continues to own CMS behavior, data contracts and
  permission checks.

## Rules For New Work

Do not add new route implementations directly to `app.js`. Add a focused file
under `mother/server/http/` and mount it from `createBlogposterApp.js`.

Do not move business logic into server composition files. If a behavior belongs
to a module, keep it in `mother/modules/*` and expose it through an event,
facade or existing module service.

When route order matters, update `tests/serverComposition.test.js` or the
route-specific boundary test so the ordering remains explicit.
