# metadataManager

## Boundaries

Metadata Manager is the core contract for custom fields and values. Apps,
widgets and community modules do not write metadata tables directly; they use
module-owned events or Runtime Manager facades that preserve the target model
and permissions. Payloads must carry `moduleName: "metadataManager"`,
`moduleType: "core"` and a valid JWT for direct manager events.

Core metadata and custom fields domain. It is backend-only and stores reusable
field definitions plus values for content, media, users, comments, paths, global
records and source-owned records.

## Startup

Loaded as a core module after `contentEngine`. Initialization creates the
metadata database/schema through `databaseManager` and registers event listeners
on `motherEmitter`.

## Events

- `registerMetaField` - creates or updates a field definition. Requires
  `metadata.manage`.
- `getMetaField` - fetches one definition. Non-managers only see public fields.
- `listMetaFields` - lists definitions. Non-managers are restricted to public
  definitions.
- `deleteMetaField` - removes a definition. Requires `metadata.manage`.
- `setMetadata` - writes a value for a target and coerces it to the registered
  value type when a definition exists. Requires `metadata.manage`.
- `getMetadata` - lists values for a target. Non-managers only receive public
  values.
- `getMetadataValue` - returns one value by key for a target.
- `deleteMetadata` - removes values by target and optional key/language.
  Requires `metadata.manage`.
- `deleteMetadataForTarget` - removes all values for a target. Requires
  `metadata.manage`.

## Targets

Supported targets are `contentEntry`, `mediaAttachment`, `user`, `comment`,
`source`, `path` and `global`.

Convenience payloads such as `entryId`, `attachmentId`, `userId` and
`sourceModule`/`sourceId` are normalized into the target model. Retired
`termId`/`taxonomyTerm` targets are rejected; page hierarchy metadata should be
stored against the relevant page or content entry instead.

## Value Types

Supported field/value types are `string`, `text`, `number`, `boolean`, `json`,
`date` and `url`.

URL values must be root-relative paths/fragments/queries, plain relative paths
normalized to `/...`, or absolute `http`, `https`, `mailto` or `tel` URLs.
Other schemes, protocol-relative links, backslashes, whitespace and control
characters are rejected.

JSON values, field settings and metadata bags are sanitized before storage and
when imported/source-owned records are read back. Non-JSON values are removed, depth and size
are capped, and prototype-pollution keys such as `__proto__`, `constructor` and
`prototype` are stripped.

## Storage

The module owns:

- `metadata_fields`
- `metadata_values`

SQLite prefixes table names with `metadataManager_`, Postgres uses the
`metadataManager` schema and Mongo uses bare collection names.
