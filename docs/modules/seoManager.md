# SEO Manager

## Boundaries

SEO Manager owns metadata, sitemap and robots contracts as a core module.
Public renderers and routes consume resolved SEO through Runtime Manager; admin
surfaces mutate SEO through allowlisted facade actions. Direct SEO writes
require `moduleName: "seoManager"`, `moduleType: "core"`, a valid JWT and
`seo.manage`.

Core SEO metadata, robots and sitemap domain. It is backend-only and does not
add UI screens by itself.

## Settings and image defaults

- Settings > SEO reads and saves through the existing `seo.defaults` and
  `seo.setDefaults` admin facade actions (`seo.manage`). Its old `SEO_*` settings
  are displayed until the first explicit save, which adopts them into SEO Manager.
  Legacy settings are then ignored; no dual writes occur. Save once to activate
  values entered in the old form.
- The title pattern lives in global `meta.titleTemplate`; `%title%` is replaced
  with the page title. An explicit SEO title overrides the pattern.
- Image precedence: explicit SEO override / page `seo_image`, page or entry
  `meta.featuredImage` (post content may also provide `featuredImage`), global
  `og_image`. Empty image fields inherit; they do not suppress a fallback.
- Global `noindex` also applies to pages with their own metadata. Other global
  SEO fields and metadata survive saving the Settings form.
- Public Open Graph and Twitter image tags are emitted in the first HTML with
  absolute URLs. Selected images must be publicly accessible. No image is inserted
  into a page's visual layout by these metadata settings.
- Image fields request `publicUrlOnly` from the existing media picker. This uses
  the established public media URL resolver and rejects private selections without
  creating share links or changing file access.
  Use **Choose from file manager** above the URL field to select an existing image;
  entering a public image URL remains an alternative.

## Startup sequence
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
- Published page envelopes resolve SEO through the existing `resolveSeoMeta`
  event, using translated page fields as the content fallback. Explicit
  source-owned SEO overrides retain precedence over those fields and global
  defaults. A resolver failure logs `PUBLIC_SEO_RESOLVE_FAILED` and preserves
  the published page's own metadata.
- The first HTML response includes the title, description, Open Graph/Twitter
  metadata and canonical link; it does not depend on client JavaScript.
  `publicHead.js` escapes attribute values and expands root-relative image and
  canonical URLs using `APP_BASE_URL`, or the request origin when unset.
  Empty descriptions and images are omitted; no arbitrary content image is
  selected. Configure these fields in the existing Page Editor SEO controls.
- Regression coverage: `publicSeoHead.test.js`, `seoManagerEvents.test.js` and
  `publicPageNestedRoutes.test.js` cover rendering, fallback/override precedence
  and metadata in the first route response.
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
