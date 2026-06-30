# Content Engine

Core domain for WordPress-style content primitives. It is loaded before
`pagesManager` so existing page events can stay compatible while new modules
move to a cleaner content contract.

## Responsibilities

- Registers content types such as `page` and `post`.
- Stores content entries with status, slug, permalink, language, parent, meta
  and structured content.
- Validates permalink and `contentTypeKey/slug/language` conflicts before
  writes so public routing stays deterministic across database engines.
- Normalizes content paths, IDs, content JSON and metadata before persistence.
- Creates a revision whenever an entry is created or updated.
- Leaves collection/grouping behavior to `pagesManager` parent/child pages
  instead of maintaining a separate taxonomy model.

## Events

- `registerContentType`
- `getContentType`
- `listContentTypes`
- `createContentEntry`
- `updateContentEntry`
- `publishContentEntry`
- `getContentEntry`
- `getContentEntryBySource`
- `resolveContentPermalink`
- `listContentEntries`
- `listTrashedContentEntries`
- `listScheduledContentEntries`
- `publishScheduledContentEntries`
- `getContentRevisions`
- `getContentRevision`
- `restoreContentRevision`
- `trashContentEntry`
- `restoreContentEntry`

## Page Projection Bridge

`pagesManager` remains the page projection facade for the current UI. Successful
`createPage` and `updatePage` calls are mirrored into Content Engine as
`page` entries with `sourceModule: "pagesManager"` and `sourceId` set to the
source page id. The mirror is optional and fault tolerant: if Content Engine is
not loaded or the mirror fails, the existing page event still completes.

New backend features should prefer Content Engine events and only expose
page projection events where existing UI code still depends on `pagesManager`.

## Content Lifecycle

Content entries support draft/review/scheduled/published/private/archived
states plus soft deletion. `trashContentEntry` marks an entry as deleted without
removing revisions. `restoreContentEntry` clears `deleted_at` and restores the
entry to a non-deleted status. Scheduled entries can be listed with
`listScheduledContentEntries` and batch-published with
`publishScheduledContentEntries`. `runtimeManager` runs that publishing event on
a timer so scheduled content can move live without a manual admin action.

## Public Runtime

`runtimeManager` exposes a read-only public adapter for Content Engine:
`GET /api/public/content?path=/example` resolves a single permalink and
`GET /api/public/content/:contentTypeKey` lists published entries. These routes
always request or enforce `status: "published"` and return 404 for draft,
review, scheduled, private or archived entries.

For editor preview, `runtimeManager` exposes a separate signed flow:
`createContentPreviewToken` creates a short-lived token for an entry, revision
or autosave, and `GET /api/public/preview?token=...` returns that preview with
`Cache-Control: no-store`. This is intentionally separate from the public
content routes so drafts are not exposed by permalink.

## Boundaries

- The module only persists through `contentService` DatabaseManager events. It
  does not open storage connections or mutate other modules directly.
- Meltdown payloads must identify `moduleName: "contentEngine"` and
  `moduleType: "core"`. Apps, widgets and community modules should use public
  content contracts instead of DatabaseManager placeholders.
- Permalinks are internal paths only. Explicit permalinks are cleaned into
  slash-prefixed slug segments; absolute URLs, protocol-relative paths,
  backslashes and script/data schemes are ignored or rejected before lookup.
- Entry IDs, revision IDs and source IDs must be scalar values. Object
  payloads do not become accidental `[object Object]` database keys.
- `content`, `meta`, content type `fields` and `settings` are sanitized as JSON:
  unsafe object keys such as `__proto__`, `constructor` and `prototype` are
  dropped, unsupported values become `null`, and nested structures are capped.
- List limits, offsets, revision versions and scheduled dates are normalized
  before reaching persistence placeholders.

## Revisions

Every create/update writes a revision. `getContentRevisions` lists the history,
`getContentRevision` loads one revision by id or `entryId/version`, and
`restoreContentRevision` copies a revision back onto the current entry while
creating a fresh revision for that restore operation.

## Collections

Collections are represented by public pages with child pages, or by public
pages whose metadata contains `isCollection: true`. Admin UI should discover
and manage those structures through `pagesManager` events such as
`getPagesByLane`, `getChildPages`, `createPage` and `updatePage`. Content
Engine does not register categories, tags or custom taxonomy terms.

## Search Indexing

When `searchManager` is loaded, Content Engine create/update/restore operations
optionally mirror entries into the search index. `trashContentEntry` removes
the matching search document. The mirror is fault tolerant, so Content Engine
writes continue even when Search is not loaded or indexing fails.
