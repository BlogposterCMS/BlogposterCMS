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
  frontend and theme search.
- Runtime sends an explicit public principal and also filters results to
  `status: "published"` and `visibility: "public"` before returning them.
- Private-looking metadata keys are stripped from public search responses.

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
