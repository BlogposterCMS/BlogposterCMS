# Analytics

Analytics is a separate top-level `/admin/analytics` workspace. The core
`analyticsManager` module owns collection, retention and summaries. All Analytics
catalog widgets share
`cmsAdminApiRequest` → `analytics.summary`, protected by `analytics.read`.
Home uses the selected two-thirds website and one-third operations widgets.
The overview and Home share the interactive [chart component](shared-widget-visuals.md).

## Pages and extensions

The workspace starts with an overview at `/admin/analytics` and three sidebar
pages: `website`, `devices` and `system`. These are normal Pages Manager admin
pages with the existing `default-sidebar`, not fixed tool surfaces. Sidebar
**Add** creates more pages. The shared breadcrumb header no longer exposes the
legacy **Edit layout** toggle. Existing saved widget arrangements still render;
interactive layout editing is not offered through that header. Pages/layout write
permissions remain required independently of `analytics.read`.

The shared dashboard drag preview includes open shadow-root content. During a
move only the destination placeholder occupies grid space; cancelling restores
the original card. Editable dashboard backgrounds use the surrounding canvas.

Standard pages use `config.seedOnce`: existing page metadata, order, intentional
empty layouts and deleted pages are not overwritten/reseeded. The previous
fixed Analytics root receives a one-time unlock and its original desktop `page`
slot becomes `full`; other instances, order and metadata are preserved.

Available widgets are `analyticsDashboard` (overview/trend), `analyticsOverview`
(compact metrics), `analyticsWebsite`, `analyticsDevices` and `analyticsSystem`.
They support normal non-exclusive half/full slots and can also be placed on
custom pages or Home. Each widget has its own period control and uses the same
authorized summary API regardless of the URL where it is placed.

Other modules contribute admin widgets through the existing Widget Manager /
PlainSpace registry and declare their existing `metadata.apiActions`. Users
choose those widgets from the shared catalog; there is no Analytics-only
registry or permission grant. Module widgets retain their module-owned data,
event facade and permissions. Existing community admin-page seeding remains
namespaced as before; modules do not silently insert pages into this workspace.

## Measurements

- Public HTML deliveries: completed GET responses for canonical published CMS
  pages. Reloads and bots count. Signed previews, DNT and GPC requests do not.
  This does not count client-only navigation or legacy static `/p/` exports.
- Device class, browser and OS: coarse user-agent categories, not verified
  hardware/software identity. Referrers retain the hostname only.
- System activity: JWT-validated motherEmitter dispatches, target module,
  verified actor ID/module identity and callback success/error. Facade events
  retain their resource/action. Internal DB and Analytics events are excluded
  to prevent collection recursion. One user action may emit several events.
  Callback-free events are `dispatched`, not confirmed successes. Auth bootstrap,
  rejected JWTs and callbacks that never complete are outside these counts.

Website history now includes delivery time, page ID/title/canonical path, referrer
domain and device/software categories. With explicit recognition consent it also
includes a verified signed-in CMS account ID and browser-supplied visitor/session
UUIDs. Browser IDs are pseudonymous correlation labels, not authenticated identities.
Unknown and historical visitors cannot be identified retroactively. The website
widget filters the latest 500 page records in the chosen period; the reporting
read cap still applies and is shown as `ANALYTICS_INCOMPLETE`.

Raw cookies, IP addresses, raw user agents, payload bodies, tokens, arbitrary
error messages and query strings are not retained. Bounce rate, conversions,
clicks on non-page elements and browser performance are **not measured**. These
are HTML deliveries, not proof of a human click or unique person. Existing debug
logs are not imported as historical analytics.

## Cookie consent and connectors

Settings → General → **Privacy & analytics** owns one atomic, public-safe
`WEBSITE_ANALYTICS_CONFIG` setting. The existing Settings permissions and facade
remain authoritative. Agent clients can read/write that setting through Settings;
the form also participates in the existing workspace agent and unsaved-change flow.

- Website collection defaults off, with opt-in selected. Enable collection and
  the banner to activate it. Turning either off suppresses optional collection.
- Configure offered analytics, recognition, marketing and personalization
  categories; banner title/explanation, top/bottom position and site-relative
  privacy link; policy version; consent/visitor lifetimes and session timeout.
- Opt-in collects nothing optional before a choice. Opt-out permits anonymous
  first-party delivery counts before a choice. Recognition, Google and GeoIP
  still require an explicit analytics grant. DNT/GPC override optional grants.
- Accept, reject and save-selection actions remember `bp_consent`; the persistent
  Privacy preferences button reopens it. Expiry or a new policy version requests
  a new choice. Invalid/stale cookies never grant optional collection.
- Recognition additionally uses `bp_visitor` (configured days) and `bp_session`
  (configured inactivity minutes). These cookies use Path=/, SameSite=Lax and
  Secure on HTTPS. Necessary authentication/security cookies remain unchanged.
- Saving reloads the document so the next server delivery has the selected
  consent. Withdrawal deletes the correlation cookies and the connector's GA
  cookies, disables the loaded tag and reloads into a clean document. It stops
  future collection; it does not delete already retained reports.

The banner reuses the scoped UI kit, not the site's global styles. It exposes a
`bp:consent` document event with effective category booleans. Marketing and
personalization are integration preferences, with no bundled consumers yet.
Arbitrary scripts in custom HTML or other widgets are **not automatically
intercepted**; their owners must honor the same consent lifecycle.

Reviewed browser adapters live in `ui/shared/analytics/connectors/`, following
Auth's provider-folder pattern. Settings cannot supply executable code/URLs.
The GA4 adapter is explicitly **UNTESTED** for live delivery. It defaults off,
requires a `G-…` measurement ID and explicit analytics consent, keeps advertising
signals denied and does not send CMS account/browser IDs. Its explicit page-view
payload omits URL queries/fragments. Keep property-side enhanced measurement and
additional tags disabled until live acceptance verifies their behavior. Local
adapter tests are not Google Tag Assistant or GA ingestion verification. See
[Google's basic consent mode](https://developers.google.com/tag-platform/security/concepts/consent-mode)
and [consent implementation](https://developers.google.com/tag-platform/security/guides/consent).

GeoIP is owned by the separate [GeoIP Manager](modules/geoipManager.md). Analytics
only consumes approximate country/region/city or a searchable `GEOIP_*` status.
IP lookup happens after the response, and the stored timestamp remains the actual
delivery time. Express's existing trust-proxy policy supplies the client IP.

## Storage and operation

DatabaseManager remains the only database owner. Fixed placeholders support
SQLite, PostgreSQL and MongoDB. Records use a versioned JSON envelope; retry IDs
make partially completed batches idempotent. A maximum of 2,000 records waits
in memory, flushed every five seconds or before a report. A hard crash can lose
that pending window. Queue drops and storage errors are visible in summaries.
Raw records expire after 60 days; time filters are rolling 1, 7 and 30 days with
an equal previous period and UTC daily groups. Reports read at most 100,001
records and explicitly flag truncation rather than claiming complete totals.

The JSON normalization/aggregation in `domain.js` has no Node dependencies.
Only `index.js` and existing host integration depend on today's CommonJS/server
runtime. Go migration must implement the same version-1 envelope and summary,
permission checks and DatabaseManager operations. This change does not create
a Go sidecar or a second event bus. Errors use `ANALYTICS_*` codes.

Agent clients can already query `analytics.summary` through the existing admin
facade and their granted permission. A visual AgentManager workspace snapshot
adapter is not yet provided; DOM scraping is not required to read analytics.

## Verification

The consent/history extension was checked locally with focused regression tests
and the running CMS: Settings save/deep link, public accept/reopen/reject with
reload, linked account/browser/session rows across pages and visitor filtering.
The banner and history were also checked at a 390px viewport. These checks do
not establish live GA ingestion or licensed GeoIP-provider acceptance.

Focused tests cover authorization, metadata minimization, period boundaries,
queue bounds/retry, emitter callback semantics, opt-outs, HTML injection and
real SQLite writes including 2,000-event bursts. PostgreSQL and MongoDB adapter
calls are tested with mocks; live server acceptance used SQLite. The local CMS
was checked in the browser at desktop and 390px widths, including a 30-day
period change. Build/browser compilation and UI lint passed. Deployment is a
separate step; these checks do not establish production throughput capacity.

Editable workspace checks cover seed preservation and migration, view isolation,
catalog contracts and accessible page creation (47 focused tests). Browser
acceptance created a custom page, combined Analytics and Page Stats widgets,
saved the layout and confirmed both widgets survived a reload.
