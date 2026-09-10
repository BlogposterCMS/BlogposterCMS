# Article tags and translated discovery verification

Classification: material backend change in existing authorities; neutral runtime
impact. No schema, permission or content-ownership cutover.

- [x] 131 focused tests pass across 14 suites: normalization, native editor/list,
  public HTTP search backed by SQLite, locale projections, public page HTML,
  inherited layout and Designer public-data transport.
- [x] Placeholder parity checks pass. PostgreSQL JSON and MongoDB all-tag query
  construction are covered; live PostgreSQL/MongoDB execution is not claimed.
- [x] Browser build and full production asset build pass. Existing article-editor
  bundle-size warnings remain.
- [x] Real local CMS: save a Chinese tag, reload it, filter the authorized page
  list, and find the translated guide through both language search requests.
- [x] Published public content resolves the requested translation using the
  same canonical entry identity; initial page HTML and browser bootstrap agree.
- [x] Native Designer shared-layout save/reload and narrow public layout checked.
- [ ] Release/update installation and production acceptance.

Existing pages acquire complete translation projections on their next normal
save. Reindex complete Content Engine entries through the existing bounded
action. Search remains a repairable read model: interrupted replacement may
require reindexing. Rollback uses the previous engine release; retain authored
tags/translations and reindex after restoring the intended engine version.
