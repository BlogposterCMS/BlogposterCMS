# Public widget services

Community Widgets use reviewed `widget.js` and `widgetInfo.json` packages with
the isolated v2 worker contract. Designer and public rendering share the host
renderer. See [community isolation](community-isolation.md); older same-document
widgets must migrate before installation.

## Configuration and ownership

An operator configures `PUBLIC_WIDGET_SERVICES` through the existing Settings
Manager (`settings.set` in the authenticated CMS admin facade, permission
`settings.core.edit`). Its value is `{ "version": 1, "widgets": { "example": {
"draft": true, "operations": { "search": { "path": "/api/public/search",
"method": "GET", "query": ["q"] } } } } }`.

Settings > Widgets provides **Import service configuration** for that versioned
JSON file (up to 128 KiB). Review each named API destination, session requirement,
stream and query keys before saving. Imports accept only destination, draft and
locale/theme descriptors; package receipts and approval fields are rejected.
Unrelated widget entries and existing installer receipts/grants are preserved.
The form uses `settings.get/set`, so `settings.core.view/edit` still apply.
After configuration, use **Manage installed access** to grant the declared names;
configuration alone does not grant access to an installed package.

This setting is not widget metadata and is not included in public settings.
`GET /api/public/widget-services/:widgetId` projects only validated, non-secret
operation descriptors for that widget. Invalid configuration fails closed with
`WIDGET_SERVICE_POLICY_UNAVAILABLE`. Missing widget configuration grants nothing.
The projection never returns credentials, arbitrary extra fields or other widgets.

## Host service contract

The trusted host implements these named services behind the v2 worker bridge:

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

Designer/catalog preview uses ephemeral drafts and denies network operations.
Use the public preview to exercise live search and application services.
Public modules never receive `jwt` or `emit` through the shared mount context.

## Security and limitations

Services are a controlled integration API; mandatory worker isolation is defined
separately in the community isolation contract. Review installed code. Backend endpoints remain solely
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

Install private packages through the reviewed ZIP installer and retain the
deployment's widget volume and integrity receipts alongside `/app/data` backups.
Do not mount private files into signed managed trees or edit integrity manifests.
Image updates do not provide or publish private widget bundles or site content.

## UI-installed package grants

The existing per-widget policy may contain a core-written `packageAccess` record
with `policyVersion: 1`, requested services, approved service keys and package
identity. Public projection intersects this consent with operator configuration;
the receipt and raw grant record are never returned publicly. Widgets cannot
self-grant through widgetInfo.json. Legacy operator-only policies remain unchanged.

Managed requests fetch current policy before dispatch. Managed streams and local
draft/preference helpers refresh every five seconds and fail closed if that read
fails; streams close when policy changes. Disposal cancels the refresh timer.
Already dispatched backend requests cannot be revoked retrospectively. Backend
authorization remains required independently of worker isolation and host grants.
