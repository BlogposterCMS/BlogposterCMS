# Runtime Manager

## Boundaries

Runtime Manager is the HTTP and facade layer between browser surfaces and core
modules. Public routes expose read-only or narrowly mutating contracts, while
admin requests are translated into allowlisted core events with permissions.
Apps and widgets should call Runtime Manager resources instead of emitting raw
module events, database events or system lifecycle events.

Connects public HTTP behavior to backend core events.

## Startup

- Core module loaded after `themeManager`.
- Requires the Express `app`, `motherEmitter` and a core JWT.
- Does not own storage; it delegates to existing core modules.

## Purpose

- Serve published Content Engine entries through `/api/public/content`.
- Serve public search through `/api/public/search`.
- Serve public comment listing/submission through `/api/public/comments`.
- Serve signed editor previews through `/api/public/preview`.
- Serve public navigation trees through `/api/public/navigation/:locationKey`.
- Serve allowlisted public settings through `/api/public/settings`.
- Serve resolved public SEO metadata through `/api/public/seo`.
- Provide the admin-facing `cmsAdminApiRequest` facade over core CMS modules.
- Provide the public read-only `cmsPublicRuntimeRequest` facade for legacy
  public rendering reads.
- Serve `/sitemap.xml` through `seoManager.generateSeoSitemap`.
- Serve `/robots.txt` through `seoManager.generateRobotsTxt`.
- Resolve public GET/HEAD requests through `redirectManager.resolveRedirect`.
- Run a scheduled publishing tick through `contentEngine.publishScheduledContentEntries`.

## Public API

- `GET /api/public/content?path=/post/example&lang=en` resolves one published
  Content Engine entry by permalink and returns the entry plus SEO metadata.
- `GET /api/public/content/:contentTypeKey?limit=25&offset=0` lists published
  entries for a content type. Without `:contentTypeKey`, it lists published
  entries across types.
- `GET /api/public/search?q=term&type=post&limit=20&offset=0` searches only
  published/public documents and returns public-safe result metadata.
- `GET /api/public/comments?entryId=123&limit=50&offset=0` lists approved
  comments for a public content target.
- `POST /api/public/comments` creates a pending public comment. Accepted target
  fields are `entryId` or `sourceModule` + `sourceId`; accepted author fields
  are `authorName`, `authorEmail` and `authorUrl`.
- `GET /api/public/preview?token=...` renders draft/review/private content only
  when the token was created by `createContentPreviewToken`.
- `GET /api/public/navigation/:locationKey` returns the active menu items and
  tree for a public navigation location.
- `GET /api/public/settings?keys=SITE_TITLE,FAVICON_URL` returns allowlisted
  public settings only.
- `GET /api/public/seo?path=/post/example` returns merged public SEO metadata.
  If the path maps to a draft/private entry, the endpoint returns 404 instead
  of leaking preview metadata.

Public content responses only expose entries with `status: "published"`.
Runtime also filters private-looking metadata keys such as underscore-prefixed
fields, token/password/secret/private/permission/role fields and hidden
navigation items.
Public comment responses omit emails, IP hashes and user agents, and public
comment submissions are forced to `pending` moderation.

## Preview Flow

- Admin/editor UI calls `/api/meltdown` with event `cmsAdminApiRequest`,
  `moduleName: "runtimeManager"`, `moduleType: "core"`, `resource: "preview"`,
  `action: "token"` and an `entryId`, `sourceModule` + `sourceId`, or `path`
  inside `params`.
- The caller needs `content.update`.
- Optional fields: `revisionId`, `version`, `autosaveId`, `useAutosave` and
  `ttlSeconds`.
- The event returns `{ token, previewUrl, expiresAt, entry }`.
- The public preview route verifies the HMAC token, loads the entry, overlays
  the requested revision/autosave when present, and returns `Cache-Control:
  no-store`.
- Set `CONTENT_PREVIEW_SECRET` in production to isolate preview-token signing
  from the general JWT/session secrets.

## Admin Facade

Admin/editor UI can call `/api/meltdown` with event `cmsAdminApiRequest`:

```json
{
  "eventName": "cmsAdminApiRequest",
  "payload": {
    "moduleName": "runtimeManager",
    "moduleType": "core",
    "resource": "content",
    "action": "list",
    "params": { "contentTypeKey": "post", "status": "draft" }
  }
}
```

The facade requires an authenticated non-public admin principal from Meltdown,
checks the required permission, and then dispatches only allowlisted
resource/action pairs to their backing core events. Public tokens are accepted
only by the explicit public bootstrap contract, not by this facade. It returns
`{ resource, action, eventName, data }`.
The HTTP Meltdown route blocks direct database/system events and raw placeholder
payloads, so admin UI and apps should use this facade instead of calling core
module internals directly.
Direct `/api/meltdown` calls are blocked for facade-owned admin read/write
actions across content, content types, media, widgets, workflow,
PlainSpace layout/presentation, navigation, SEO, comments, metadata, redirects,
search, settings, unified settings, translations, fonts, server locations,
shares, preview tokens, identity, app/module management, importers, exporters,
notifications, themes and Designer persistence. Legacy HTTP callers that still send those low-level
event names are translated at the HTTP adapter into `cmsAdminApiRequest`, with
the legacy response data unwrapped for compatibility. New callers should use
the facade request shape directly.

When the request comes from an iframe app through `appLoader`'s
`cms-admin-request` bridge, the facade treats it as app-origin and allows only
approved content/presentation query actions. Identity, permission, module/app
registry, importer/exporter and private settings resources are not exposed to
app-origin requests even when the current admin principal has broad
permissions. Direct admin UI calls can still use mutating actions when the admin
principal has the required permission.

Core-owned compatibility apps may reach mutating facade actions only through
AppLoader's validated legacy `cms-meltdown-request` /
`cms-meltdown-batch-request` bridge. That exception exists for bundled internal
apps such as Designer; it does not apply to user-managed apps or to
`cms-admin-request`, which remains query-only for every iframe app.

App-origin read access is limited to content and presentation contracts:
`content`, `pages`, `contentTypes`, `media`, `navigation`, `seo`,
`plainSpace`, `settings.public`, `themes` and `translations`.

Allowed resources:

- `content`: list/get/create/update/publish/trash/restore/revisions/revision/restoreRevision/scheduled/trashed
- `pages`: list/byLane/get/getBySlug/start/children/envelope/search/create/update/trash/delete/setStart
- `contentTypes`: list/get/upsert
- `media`: list/get/create/update/delete/variant/relation/local-folder actions
- `widgets`: list/create/update/delete/saveLayout
- `plainSpace`: widgetRegistry, layout/template reads, layout/template writes,
  widget instance reads/writes and published design metadata actions
- `workflow`: locks, autosaves and review queue actions
- `navigation`: locations, menus, items and tree actions
- `seo`: defaults, metadata CRUD and resolve
- `comments`: create/get/listForEntry/update/updateStatus/delete
- `metadata`: field registry and metadata value CRUD
- `redirects`: rule CRUD, resolve, recordHit and listHits
- `search`: index/get/remove/query/reindexContent
- `settings`: list/get/public/cmsMode/setCmsMode/set/bulk/delete
- `auth`: loginStrategies/setStrategyEnabled
- `users`: list/get/getByUsername/count/create/update/delete
- `roles`: list/create/update/delete/assign/remove/forUser/incrementToken
- `permissions`: list/create
- `modules`: registry/system/activeGrapes/activate/deactivate/installZip
- `apps`: list/get/builderList/launchInfo/rescan/installFromDirectory/uninstall
- `fonts`: listProviders/list/add/setProviderEnabled
- `notifications`: recent
- `importers`: list/run
- `exporters`: list/run
- `serverLocations`: create/get/list/update/delete
- `shares`: create/get/revoke
- `unifiedSettings`: schema registry, module settings bundle and value updates
- `themes`: list/get/active/activate
- `translations`: text CRUD and language CRUD
- `designer`: get/list/layout reads and save through builder permissions
- `preview`: token

This facade is intentionally not a public route. It exists so frontend modules
can depend on a stable CMS contract without coupling to every low-level
motherEmitter event name.

## Public Runtime Facade

Public rendering can use `cmsPublicRuntimeRequest` only through the HTTP
adapter. Legacy public reads are translated when their payload is explicitly
public, for example `getStartPage`, `getEnvelope`, `getPageBySlug` with
`lane: "public"`, `getWidgets` with `widgetType: "public"`,
`widget.registry.request.v1` with `lane: "public"` and public PlainSpace layout
reads. Public runtime `designer.getDesign` reads are also routed here.

The facade accepts a valid public or admin token from the caller, but uses the
Runtime Manager core token for the underlying module query. It only exposes
published public pages, public widgets, public layout reads and default widget
instance options. Designer reads require an id, return only non-draft designs
and strip private owner/user audit fields. For PlainSpace public reads, the
facade forces `lane: "public"` for registry/layout/template calls, only allows
`default.*` widget instances, filters any returned `lane: "admin"` objects, and
strips private-looking fields such as secret/token/private metadata. It strips
private-looking page metadata and has no mutating actions.

## Runtime Rules

Redirect checks skip admin/API/static paths such as `/admin`, `/api`,
`/assets`, `/build`, `/ui`, `/themes`, `/apps`, `/widgets` and `/fonts`.
When maintenance mode is active, redirects are skipped so the existing
maintenance middleware can decide the public response.

Scheduled publishing runs every 60 seconds by default. Set `CONTENT_SCHEDULER_INTERVAL_MS` to tune the interval or `CONTENT_SCHEDULER_DISABLED=true` to disable the timer.
