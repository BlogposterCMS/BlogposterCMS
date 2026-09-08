# Public widget services

Community Widgets use the ordinary `widgets/<id>/widget.js` module and
`widgetInfo.json` registration. Designer and public rendering share the module
mount path. No page-specific inline bundle or global page DOM mutation is needed.

## Configuration and ownership

An operator configures `PUBLIC_WIDGET_SERVICES` through the existing Settings
Manager (`settings.set` in the authenticated CMS admin facade, permission
`settings.core.edit`). Its value is `{ "version": 1, "widgets": { "example": {
"draft": true, "operations": { "search": { "path": "/api/public/search",
"method": "GET", "query": ["q"] } } } } }`.

This setting is not widget metadata and is not included in public settings.
`GET /api/public/widget-services/:widgetId` projects only validated, non-secret
operation descriptors for that widget. Invalid configuration fails closed with
`WIDGET_SERVICE_POLICY_UNAVAILABLE`. Missing widget configuration grants nothing.
The projection never returns credentials, arbitrary extra fields or other widgets.

## Browser contract

`render(container, context)` receives `context.services` for community modules:

- `request(name, { params, query, body }, signal)` uses the configured method and
  same-origin `/api/` path. Path parameters are bounded identifier segments.
  Query keys are allowlisted; caller headers, destinations and methods are absent.
  Requests time out after 12 seconds, reject redirects, and bound request bodies
  to 16 KiB characters and streamed JSON responses to 1 MiB bytes.
- `subscribe(name, event, receive, onError)` requires an explicitly credentialed
  GET stream. It permits one connection per instance, closes on errors, and expires
  after 15 minutes. Event payloads are limited to 64 KiB characters. It returns
  `close()`; instance removal and page exit also dispose subscriptions.
- `draft.get()` / `draft.set(string)` retain **unsent drafts only** in tab-scoped
  storage, namespaced by widget, with a 16 KiB character limit and 24-hour expiry.
  This is not account-scoped storage. Do not store replies, tokens, tenant ids,
  account data, or authoritative conversation state. The backend must re-resolve
  current identity after login/reload. Widgets handle unavailable storage visibly.
- Optional `preferences.get/set` supports explicitly configured locale/theme
  cookies and enum values. Authentication cookies are not a supported preference.

Designer/catalog preview filters out mutations, credentialed reads, streams and
persistent drafts. Preview may search public content but cannot open a support case.
Public modules never receive `jwt` or `emit` through the shared mount context.

## Security and limitations

Services are a controlled integration API, **not a JavaScript sandbox**. Existing
Community Widget static scanning remains unchanged; installed scripts still run
in the browser realm. Review installed code. Backend endpoints remain solely
responsible for authentication, tenant/record authorization, CSRF, idempotency,
rate limits and audit. A browser policy does not replace those checks.

The CMS does not proxy authenticated traffic or mint application credentials.
Operators route named application endpoints to their authoritative service; CMS
routes must continue stripping unrelated application cookies at the proxy.
No external identity provider, AI engine or token streaming backend is supplied
by this contract. SSE can deliver incremental events if the external service
implements them; a notification-only backend remains notification-only.

Studio uses an opaque-origin iframe. Community previews receive ephemeral drafts
and no network operations or host preferences. Exercise live service operations
through the public preview; no iframe sandbox relaxation is needed.

Container deployments must mount site-owned widget assets read-only at their
registered `/app/widgets/<widget-id>` path from the separate customization
repository. Copying a widget into a running image is not update-persistent. The
CMS database retains registrations, page designs and Settings Manager policy in
`/app/data`; image updates do not provide or publish private widget bundles.
