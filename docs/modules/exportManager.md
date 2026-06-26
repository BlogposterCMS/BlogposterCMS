# Export Manager

## Boundaries

Export Manager is a read-heavy core orchestration module. Apps and widgets do
not assemble exports by querying storage or other modules directly; they call
the admin runtime facade, which forwards to `listExporters` or `runExport` with
a scoped `exportManager` core payload. Export options are treated as user input
and cannot override control fields such as `jwt`, `decodedJWT` or
`motherEmitter`.

Builds portable exports from existing core CMS events.

## Startup

- Core module loaded after the importer and before `themeManager`.
- Requires a valid core JWT.
- Owns no storage; it orchestrates content, media, metadata and settings events.

## Purpose

- Lists available exporters through `listExporters`.
- Runs a named exporter through `runExport`.
- Produces a Blogposter JSON backup package for migration and restore tooling.
- Produces a WordPress WXR-compatible XML export for published content.
- Keeps export logic behind a core contract so apps do not query backend internals.

## Listened Events

- `listExporters`
- `runExport`

## Permissions

- `exporters.list` allows listing available exporters.
- `exporters.run` allows building export packages.

`runExport` is not a public `/api/meltdown` target; admin/editor clients use
`runtimeManager.cmsAdminApiRequest` with resource `exporters` and action `run`.
Both events require `jwt`, `moduleName: "exportManager"` and
`moduleType: "core"`.

`runExport.options` is treated as user input. It cannot override control fields
such as `motherEmitter`, `jwt`, `decodedJWT` or `exportPayload`. Custom export
`fileName` values must be simple URL/download-safe basenames, not paths, drive
paths, traversal values or control-character strings. Custom `siteUrl` values
must be valid `http` or `https` URLs.

## Exporters

- `blogposterJson` returns `{ manifest, data, content }` with content types,
  entries, revisions, metadata, media, settings and meta field definitions.
- `wordpressWxr` returns XML content in WordPress WXR 1.2 shape for published
  entries. It does not emit category/tag term bundles because Blogposter
  collections are page parent/child structures.

The module intentionally gathers data through existing core events such as
`listContentEntries`, `listMediaAttachments`, `getMetadata` and `listSettings`.
It does not use raw database placeholders directly.
