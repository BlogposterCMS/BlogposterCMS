# SEO Manager

## Boundaries

SEO Manager owns metadata, sitemap and robots contracts as a core module.
Themes and public routes consume resolved SEO through Runtime Manager; admin
surfaces mutate SEO through allowlisted facade actions. Direct SEO writes
require `moduleName: "seoManager"`, `moduleType: "core"`, a valid JWT and
`seo.manage`.

Core SEO metadata, robots and sitemap domain. It is backend-only and does not
add UI screens by itself.

## Startup
- Core module loaded after `contentEngine`, `commentsManager` and
  `navigationManager`.
- Ensures the SEO schema/table/collection exists.
- Seeds a global default SEO record at `targetType: "global"` and
  `targetKey: "default"`.

## Purpose
- Stores global SEO defaults.
- Stores SEO metadata for content entries, paths and source-owned records such
  as `sourceModule: "pagesManager"` plus `sourceId`.
- Resolves SEO metadata by merging global defaults, Content Engine metadata and
  explicit SEO overrides.
- Generates XML sitemap output from published Content Engine entries.
- Generates `robots.txt` output from global SEO metadata rules.
- Powers the public `/sitemap.xml` and `/robots.txt` routes through
  `runtimeManager`.
- Powers the public `/api/public/seo` route through `runtimeManager`.

## Listened Events
- `setSeoDefaults`
- `getSeoDefaults`
- `upsertSeoMeta`
- `getSeoMeta`
- `listSeoMeta`
- `deleteSeoMeta`
- `resolveSeoMeta`
- `generateSeoSitemap`
- `generateRobotsTxt`

## Permissions
- `seo.manage` is required for writes and metadata listing.
- Public/internal resolution events can read metadata without user-level
  permission when no decoded user JWT is attached.

## Public Runtime
- `GET /api/public/seo?path=/example` returns merged public SEO metadata for a
  path.
- If the path maps to a non-published Content Engine entry, `runtimeManager`
  returns 404 before calling `resolveSeoMeta`, so draft/private SEO data does
  not leak.

## Targets
- `entry`: `entryId`
- `source`: `sourceModule` + `sourceId`
- `path`: `path`, `permalink` or `url`
- `global`: defaults, usually `targetKey: "default"`

## URL Boundaries

- SEO URLs such as canonical and Open Graph image URLs must be root-relative
  paths or absolute `http`/`https` URLs.
- Other schemes, protocol-relative links, backslashes, whitespace and control
  characters are stripped.
- Sitemap and robots base URLs fall back to `https://example.com` unless they
  are valid `http`/`https` origins or paths.
