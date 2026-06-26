# Changing the Render Engine

BlogposterCMS ships with a client-driven renderer by default. The public runtime
starts in `ui/runtime/entries/publicEntry.ts` and is emitted to
`/build/publicEntry.js`; the dashboard renderer starts in
`ui/runtime/entries/pageRenderer.ts` and is emitted to
`/build/pageRenderer.js`. Some deployments may prefer a traditional server-side
approach instead of relying entirely on JavaScript on the client. This document
explains where to hook in your own rendering logic and what to consider for both
strategies.

## Switching via Environment Variables

To avoid editing core files, you can toggle the renderer using the `RENDER_MODE` environment variable or by creating `config/runtime.local.js`. Set `RENDER_MODE=server` for server-side rendering or `RENDER_MODE=client` for the default client-side approach. When overriding via `runtime.local.js`, you may export `{ features: { renderMode: "server" } }` – Blogposter merges this with existing feature flags, so other settings remain intact. The application reads this flag during start-up so you modify configuration only, not the code. When `renderMode` is `server`, Blogposter automatically strips the bundled runtime renderer script from the served HTML files. Currently there is no in-app toggle; switching via environment variables or `runtime.local.js` is the supported approach.


## Server-Side Rendering

1. **Disable the default client renderer** – Remove or comment out the
   `<script type="module" src="/build/publicEntry.js"></script>` line in
   `public/index.html` and the `/build/pageRenderer.js` line in admin shells
   where applicable. With the script gone the server must provide fully rendered
   HTML.
2. **Implement a render function** – Modify `app.js` to call your preferred view
   engine (e.g. EJS, Pug, React SSR) when responding to page requests. The
   existing middleware already fetches page data via the meltdown event bus, so
   pass that data into your templates before sending the response.
3. **Sanitize any dynamic content** – When rendering on the server be mindful of
   cross-site scripting risks. Escape user input and use an established templating
   engine that auto‑escapes HTML by default.
4. **Cache carefully** – To keep load times reasonable, enable caching headers
   or server-side memoization. Never cache private content or pages containing
   user-specific data without additional controls.

## Client-Side Rendering (CSR)

1. **Keep the runtime bundle enabled** – Ensure the script tag for
   `/build/publicEntry.js` remains in public HTML and `/build/pageRenderer.js`
   remains in the dashboard shell. These bundles load widgets and layouts via
   API calls and assemble the page in the browser.
2. **Expose only needed APIs** – CSR requires the browser to fetch page data.
   Review the REST endpoints opened in `app.js` and disable any you do not need
   publicly. Use strict CORS and CSRF protections to guard admin APIs.
3. **Monitor bundle size** – Complex client renderers grow quickly. Use the
   provided Webpack config to split vendor libraries and enable compression so
   pages load fast even with many widgets.
4. **Consider a hydration step** – If SEO or first render speed is important,
   you can pre-generate minimal markup on the server and let the runtime bundle
   hydrate it. This hybrid approach keeps interactive features without fully
   committing to SSR.

Changing the render engine involves editing core files. Back up your instance
and test thoroughly before deploying new rendering logic.

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
   `ensurePublicToken` are unauthenticated public events. A small public-token
   contract (`getPublicSetting`, `getUserCount`, `listActiveLoginStrategies`,
   `loginWithStrategy`, `publicRegister`) exists for install, login and
   registration flows. All admin/editor events must carry a validated admin
   token and should use `cmsAdminApiRequest` rather than raw core events.

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
`ui/runtime/envelope/` and remains exposed through compatibility
URLs for older same-origin clients. A React client can reuse it to hydrate admin
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
