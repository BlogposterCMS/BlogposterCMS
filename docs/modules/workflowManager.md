# workflowManager

Core editorial workflow domain for collaborative editing. It is backend-only and
does not expose UI routes.

## Startup

Loaded as a core module after `metadataManager`. Initialization creates workflow
tables/collections through `databaseManager` and registers events on
`motherEmitter`.

## Events

- `acquireContentLock` - claims an edit lock for a content target. Requires
  `content.update`.
- `refreshContentLock` - extends a lock owned by the caller. Requires
  `content.update`.
- `releaseContentLock` - releases a lock. Requires `content.update`.
- `getContentLock` - returns the active lock for a target.
- `saveContentAutosave` - stores one autosave per target/author. Requires
  `content.update`.
- `getContentAutosave` - returns one autosave by id or latest target/author.
- `listContentAutosaves` - lists autosaves for a target. Requires
  `content.update`.
- `deleteContentAutosave` - deletes an autosave. Requires `content.update`.
- `submitContentReview` - creates a pending review request and optionally marks
  the Content Engine entry as `review`. Requires `content.update`.
- `approveContentReview` - marks the latest pending review as approved and
  optionally publishes the Content Engine entry. Requires `content.publish`.
- `rejectContentReview` - marks the latest pending review as rejected and
  optionally moves the Content Engine entry back to draft. Requires
  `content.publish`.
- `getContentReview` - loads one review. Requires `content.publish`.
- `listContentReviewQueue` - lists pending review items. Requires
  `content.publish`.

## Preview Integration

`runtimeManager.createContentPreviewToken` can reference an autosave with
`autosaveId` or request the latest caller autosave with `useAutosave: true`.
When the preview token is redeemed through `/api/public/preview`, Runtime
loads `getContentAutosave` and overlays the autosave fields onto the Content
Engine entry for display only. No publish or update event is emitted.

## Boundaries

- The module only persists through `workflowService` DatabaseManager events. It
  does not open storage connections directly.
- Meltdown payloads must identify `moduleName: "workflowManager"` and
  `moduleType: "core"`. Apps, widgets and community modules use workflow events
  instead of database placeholders.
- Workflow targets are restricted to content entries, safe source pairs or
  internal paths. Entry IDs, actor IDs, autosave IDs, review IDs and source IDs
  must be scalar values; object payloads do not become database keys.
- Autosave `content`, autosave/review/lock `meta` and JSON-like payloads are
  sanitized before persistence. Unsafe object keys such as `__proto__`,
  `constructor` and `prototype` are dropped, unsupported values become `null`,
  and nested structures are capped.
- Optional Content Engine updates happen through `updateContentEntry` and
  `publishContentEntry` events only when the workflow target is a content entry.
- List limits, offsets, lock expiry dates and autosave timestamps are normalized
  before reaching persistence placeholders.

## Storage

The module owns:

- `content_locks`
- `content_autosaves`
- `content_reviews`

SQLite prefixes table names with `workflowManager_`, Postgres uses the
`workflowManager` schema and Mongo uses bare collection names.
