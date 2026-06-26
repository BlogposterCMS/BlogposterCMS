# redirectManager

Core redirect domain for permalink migrations, legacy URL redirects and hit
tracking.

## Startup

Loaded as a core module after `searchManager` and before `pagesManager`.
Initialization creates a module database/schema through `databaseManager` and
then registers redirect events on `motherEmitter`.

## Events

- `upsertRedirectRule` - creates or updates a redirect rule. Requires
  `redirects.manage`.
- `getRedirectRule` - fetches a rule by `id` or `fromPath`/`language`. Requires
  `redirects.manage`.
- `listRedirectRules` - lists rules with optional `active`, `language` and
  `matchType` filters. Requires `redirects.manage`.
- `deleteRedirectRule` - deletes a rule by `id` or `fromPath`/`language`.
  Requires `redirects.manage`.
- `resolveRedirect` - resolves a request path against active exact, prefix or
  regex rules and records a hit unless `recordHit: false` is passed.
- `recordRedirectHit` - records a redirect hit and increments the rule counter.
- `listRedirectHits` - lists hit records. Requires `redirects.manage`.

## Rule Shape

Rules store `fromPath`, `toPath`, `statusCode`, `matchType`, `priority`,
`language`, `active`, optional date windows and `meta`.

Supported status codes are `301`, `302`, `307` and `308`. Supported match types
are `exact`, `prefix` and `regex`. Prefix rules preserve the unmatched path
suffix by default; set `meta.preservePathSuffix` to `false` to disable that.

Redirect targets can be internal paths or absolute `http`/`https` URLs.
`javascript:`, `data:`, `vbscript:`, protocol-relative targets, backslashes and
raw whitespace are rejected.

## Boundaries

- The module only persists through `redirectService` DatabaseManager events. It
  does not open storage connections or mutate runtime routing state directly.
- Meltdown payloads must identify `moduleName: "redirectManager"` and
  `moduleType: "core"`. Apps, widgets and community modules query redirects
  through the exposed events rather than database placeholders.
- Rule IDs and hit rule IDs must be scalar values; object payloads are rejected
  before they can become database keys.
- Rule `meta` is sanitized as a plain JSON object. Unsafe keys such as
  `__proto__`, `constructor` and `prototype` are dropped, unsupported values
  become `null`, and nested structures are capped.
- List limits, offsets and redirect priority are normalized before reaching
  persistence placeholders.

## Runtime Integration

`runtimeManager` calls `resolveRedirect` for public GET/HEAD requests before
public page rendering. Admin, API and static asset paths are skipped so
redirect rules do not interfere with the CMS shell.

## Storage

The module owns two portable collections/tables:

- `redirect_rules`
- `redirect_hits`

SQLite prefixes table names with `redirectManager_`; Postgres uses the
`redirectManager` schema; Mongo uses the bare collection names.
