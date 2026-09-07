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
**Add** creates more pages. Select **Edit layout**, then **Add widget** to place
catalog widgets; finish with the save icon in the same layout control to persist
the arrangement. Existing controls remove and arrange widgets. Pages/layout write
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

No visitor identifiers, cookies, IP addresses, raw user agents, payload bodies,
tokens, arbitrary error messages or query strings are retained. Unique visitors,
sessions, bounce rate, conversions and browser performance are **not measured**
by these sources and must not be inferred from them. Future instrumentation
belongs behind the same module contract, with an explicitly defined measurement
and privacy model. Existing debug logs are not imported as historic analytics.

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
