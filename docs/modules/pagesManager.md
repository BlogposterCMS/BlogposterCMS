# Pages Manager

## Boundaries

Pages Manager is a legacy core facade while Content Engine becomes canonical.
Admin apps and widgets should use Runtime Manager's `pages` resource instead
of emitting page events directly. Direct page events require a scoped
`pagesManager` core payload and permission checks. Mirroring to Content Engine
is one-way through core events, not shared table access.

Responsible for CRUD operations on pages and for generating default pages when the CMS starts.

## Startup
- (public token required) Core module; ensures its database schema exists then seeds default pages if needed.

## Purpose
- Provides events to create, retrieve and update pages.
- Can generate an XML sitemap and manage the start page.
- Acts as the legacy page facade while Content Engine becomes the canonical
  content domain.
- Admin/editor callers should use `runtimeManager`'s `cmsAdminApiRequest`
  resource `pages` for page reads and writes. Direct page events remain
  available only as a temporary compatibility path for the old dashboard UI.

## Listened Events
- `createPage`
- `getAllPages`
- `getPagesByLane`
- `getPageById`
- `getPageBySlug`
- `getStartPage`
- `getChildPages`
- `getEnvelope` (public token required)
- `updatePage`
- `setAsDeleted`
- `searchPages`
- `setAsStart`
- Uses a MongoDB transaction when available so the old start flag is cleared
  atomically before assigning a new one.
- `generateXmlSitemap`

Permissions are checked for each sensitive operation to avoid unauthorized modifications.

## Slug Handling
- Slugs may include `/` to denote hierarchy. Each segment is normalized independently,
  so `content/My Page` becomes `content/my-page` and `Page Ünicode` becomes
  `page/unicode`. The top-level segments `admin`, `app` and `api` remain reserved.
- Uniqueness: a slug is only unique within its lane (`public` or `admin`).
- `createPage` now returns a deterministic duplicate error (`code: DUPLICATE_SLUG`)
  for page-management calls when the requested slug already exists in the same lane.
  Auto-suffixing (`-1`, `-2`, ...) is only applied when `autoSuffixSlug: true` is
  explicitly provided by the caller.

## Returned Data
- Page retrieval events (`getPageBySlug`, `getPageById`, `getPagesByLane`) include a `parentSlug` field with the slug of the parent page when available.
- Each page also exposes a `weight` integer (default `0`). Admin interfaces sort header and sidebar menus using this field.
- `getPagesByLane` accepts an optional `language` to limit translations to a single locale per page.
- **Update semantics:** `updatePage` only modifies the `weight` when the field is supplied. Omitting `weight` keeps the existing value.
- `getEnvelope` returns a `PageEnvelope` with ordered attachments describing design, HTML and widgets for the requested public page. Clients resolve attachments by importing `/modules/<source>/publicLoader.js` or `/mother/modules/<source>/publicLoader.js` and invoking its `registerLoaders` helper to wire the loaders into their orchestrator.

A shared, framework-agnostic orchestrator and loader registry live under
`ui/runtime/envelope/`. PlainSpace, Vue, or React clients on the
same origin should import `/ui/runtime/envelope/orchestrator.js` and
`/ui/runtime/envelope/loaderRegistry.js` to process envelopes. The old
`/assets/js/envelope/*` URLs remain available as compatibility shims.

## Content Engine Bridge
- Successful `createPage` and `updatePage` writes are mirrored to
  `contentEngine` as `page` entries.
- `setAsDeleted` also trashes the mirrored Content Engine entry by source id,
  so deleted legacy pages disappear from canonical content queries.
- Mirrored entries use `sourceModule: "pagesManager"` and `sourceId` equal to
  the legacy page id, so Content Engine can resolve future updates through
  `getContentEntryBySource`.
- The mirror is optional and non-blocking for legacy behavior. If Content
  Engine is not loaded or returns an error, the original page event still
  returns its normal result.
- Core importers may pass `skipContentMirror: true` when creating page
  projections for content that was already imported through Content Engine. This
  avoids duplicate canonical entries while still exposing parent/child
  collection structure to the current Pages UI.
