# Search Manager

## Boundaries

Search Manager owns indexing and query state as a core module. Content Engine
and source-owning core modules index through explicit search events; apps, widgets and
community modules read public search through Runtime Manager. Public callers
cannot request private statuses or visibility, and direct manager writes require
`search.manage`.

Core search indexing and query domain for Content Engine entries and source-owned
records. It is backend-only and does not add UI screens by itself.

## Startup
- Core module loaded after `seoManager`.
- Ensures the search schema/table/collection exists.

## Purpose
- Stores portable search documents for Content Engine entries and source-owned
  pairs.
- Provides public-safe search defaults: non-manager callers only see
  `published` + `public` documents.
- Supports explicit reindexing from Content Engine.
- Content Engine create/update/restore events optionally mirror into Search
  when `searchManager` is loaded; trash removes the indexed document.

## Listened Events
- `indexSearchDocument`
- `getSearchDocument`
- `removeSearchDocument`
- `searchDocuments`
- `reindexContentEntries`

## Permissions
- `search.manage` is required to index/remove documents, reindex Content Engine
  entries, or search non-public statuses/visibility.
- Public callers can use `searchDocuments`, but status and visibility are forced
  to `published` and `public`.

## Public Runtime
- `runtimeManager` exposes `GET /api/public/search?q=term&type=post` for
  frontend and public-widget search.
- Runtime sends an explicit public principal and also filters results to
  `status: "published"` and `visibility: "public"` before returning them.
- Private-looking metadata keys are stripped from public search responses.

## Article tags and translations

Pages and Content Engine store public editorial labels in `meta.tags`. The
native page editor and `page.updateDraft` accept comma-separated tags; the Page
Manager filter also exposes `pages.filterTag`. These use the existing page
permissions and persistence owner, with no separate taxonomy registry.

`GET /api/public/search?tag=academy,how-to&lang=zh` requires **every** supplied
tag, using exact membership before pagination. Tags are also included in text
search. The existing Designer `publicSearch` data source accepts the same `tag`
parameter and exposes each result's `tags`. The approved endpoint/origin and
public publication policy remain unchanged.

Labels use Unicode NFKC normalization, lowercase, deduplication and trimmed
whitespace. Chinese labels are supported. At most 24 labels of 64 characters
are accepted; malformed input returns `CONTENT_TAGS_INVALID` (HTTP 400).
Omitting tags preserves existing values; an empty list explicitly clears them.
Tags are public metadata, never access control or a place for private notes.

Each canonical Content Engine entry retains its translations and revision
history. Search derives one row per language with a shared `entryId` and URL;
secondary row source IDs use `entryId:language`. A complete projection replaces
the entry's previous derived rows, including removed translations, and trash
removes all language rows. Publication state and tags always come from the
canonical entry. Locale filtering precedes pagination. Existing entries need
a normal page save (to mirror all saved translations) or a bounded reindex of
already complete Content Engine entries. No schema or content migration is needed.

Index mirrors remain optional and fault tolerant. Replacement is bounded but
is not a cross-module transaction; an index failure can temporarily leave an
entry absent or partially indexed. Repair through the existing reindex action.

## Search Documents
- Content Engine entries are indexed under
  `sourceModule: "contentEngine"` and `sourceId: entryId`.
- Source-owning modules can index under their own `sourceModule/sourceId`.
- The portable implementation uses normalized text matching across SQLite,
  Postgres and MongoDB.
- Document URLs are normalized to root-relative paths or absolute `http`/`https`
  URLs. Unsafe schemes, protocol-relative URLs and backslash paths are stripped.
- Document metadata is sanitized before indexing. Prototype-pollution keys are
  removed and unsupported values are coerced to `null`.
