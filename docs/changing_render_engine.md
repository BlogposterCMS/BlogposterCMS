# Changing the Render Engine

## Default public flow: layout first, client data afterwards

Normal public pages use the existing server/module pipeline to resolve the
published public envelope and linked layout. Pages Manager sanitizes initial
HTML or emits the shared canvas geometry with reserved widget surfaces. CSS and
image references can therefore be discovered in the first HTML response.

Keep `/build/publicEntry.js` enabled: it adopts this initial DOM and envelope,
loads presentation libraries and lets existing widget loaders fetch their data.
It does not request the start page, envelope or resolved layout again. Public
shells without a compatible handoff fall back to client discovery. Signed
Designer Live Preview continues to use its protected parent bridge.

This hybrid startup is the default and does not need `RENDER_MODE=server`.
The legacy `RENDER_MODE` hooks are not a complete SSR engine; in particular,
removing the public client entry would disable widget hydration and interactions.
No separate renderer, template store or public data API is required.

## Extension boundaries

- HTTP composition belongs in `mother/server/http/publicPageRoutes.js`, not
  `app.js`. The route owns CSP, escaped bootstrap values and no-store headers.
- Page presentation belongs in `mother/modules/pagesManager/publicPresentation.js`.
  Read through the existing public facade so draft/lane checks stay effective.
- Server and browser share `ui/shared/layout/publicCanvasPresentation.ts` for
  canvas CSS/geometry. Keep client widget data and scripts behind their existing
  module/facade and nonce-controlled execution boundaries.
- Do not cache token/nonce-bearing HTML or add long immutable cache lifetimes to
  unversioned loader imports. A different cache/render architecture needs its own
  publish/revision/language invalidation and security review.

See [public startup performance](public-startup-performance.md) for measurements
and the remaining native-module import/bandwidth costs.
## Running without the bundled admin dashboard

Some deployments prefer to disable the built-in `/admin` shell entirely and use
their own React frontend against BlogposterCMS APIs. To harden the instance:

1. **Deny or gate `/admin` routes** – Add an Express guard *before* the
   dashboard routes in `app.js` that checks an `ADMIN_DASHBOARD_DISABLED`
   environment variable and returns `404` for `/admin`, `/admin/*`,
   `/login`, `/register`, and `/admin/api/*`. Even when the middleware is in
   place, keep a reverse proxy ACL that only allows those paths from trusted
   IPs so accidental exposure is prevented at the edge.
2. **Do not serve admin assets** – When the dashboard is disabled, block
   `public/admin.html`, `/build/appFrameLoader.js`, `/build/pageRenderer.js`,
   and `/assets/css/app.css` in the proxy to reduce the attack surface. The
   React frontend can host its own bundles separately.
3. **Reuse the existing admin APIs** – Admin flows rely on JWTs issued by
   `/admin/api/login` (sets the `admin_jwt` HttpOnly cookie) and on meltdown
   events under `/api/meltdown` or `/api/meltdown/batch`. Admin events require
   a valid non-public admin token supplied either via the `admin_jwt` cookie or
   an `X-Public-Token` header. Keep `/admin/api/apps/*` and
   `/admin/api/plainspace/reseed` blocked unless the React client explicitly
   needs them.
4. **Respect CSRF, JWT, and CORS controls** – Routes under `/admin/api/*` are
   CSRF-protected; React clients need to read the `csrf-token` meta tag from the
   login page or fetch a CSRF cookie before posting credentials. The issued
   `admin_jwt` cookie is `SameSite=Strict` and `Secure` in production; for
   cross-origin React apps, send the JWT in `X-Public-Token` instead of relying
   on cookies and configure CORS to allow only the admin origin. Always prefer
   HTTPS so tokens and CSRF cookies cannot be intercepted.
5. **Limit public meltdown events** - Only `issuePublicToken` and
   `ensurePublicToken` are unauthenticated public events. Browser install,
   login-discovery, registration and public rendering helpers should use the
   issued token with `cmsPublicRuntimeRequest`; direct core events such as
   `getPublicSetting`, `getUserCount`, `listActiveLoginStrategies` and
   `publicRegister` are internal module events, not HTTP contracts. All
   admin/editor events must carry a validated admin token and should use
   `cmsAdminApiRequest` rather than raw core events.

### React frontend checklist

- Authenticate by POSTing to `/admin/api/login` with a CSRF token, then extract
  `admin_jwt` from the Set-Cookie header or use the response to source an
  `X-Public-Token` for subsequent calls.
- Use `/api/meltdown/batch` to batch admin operations with `{ eventName, payload
  }` objects; include the JWT in `X-Public-Token` to avoid cross-site cookie
  issues.
- Enable CORS only for the React admin origin and retain `helmet` defaults so
  `X-Frame-Options` and related headers stay intact.

### Optional: embedding the envelope orchestrator in React

The envelope orchestrator that powers the dashboard lives in
`ui/runtime/envelope/` and remains exposed through stable same-origin
URLs. A React client can reuse it to hydrate admin
pages:

```ts
// register loaders once
import { register } from '/ui/runtime/envelope/loaderRegistry.js';
import { orchestrate } from '/ui/runtime/envelope/orchestrator.js';

register('widget', async (descriptor, ctx) => {
  const html = await fetch(ctx.api + '/widget/' + descriptor.id, {
    headers: { 'X-Public-Token': ctx.jwt }
  }).then(r => r.text());
  ctx.mount(descriptor.target, html);
});

// later in a React effect
const envelope = await fetch('/api/meltdown', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Public-Token': jwt },
  body: JSON.stringify({ eventName: 'getPageEnvelope', payload: { slug } })
}).then(r => r.json());

await orchestrate(envelope.data, { api: '/api', jwt, mount: renderIntoDom });
```

The example keeps loaders modular, carries the admin JWT in headers, and avoids
inline scripts. In production, host the orchestrator modules on the same origin
as the React bundle to avoid CORS preflights and ensure subresource integrity.

