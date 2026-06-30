# Pages Manager

## Boundaries

Pages Manager is the current page projection facade while Content Engine becomes canonical.
Admin apps and widgets should use Runtime Manager's `pages` resource instead
of emitting page events directly. Direct page events require a scoped
`pagesManager` core payload and permission checks. Mirroring to Content Engine
is one-way through core events, not shared table access.

Responsible for CRUD operations on pages and for generating default pages when the CMS starts.

## Startup
- (public token required) Core module; ensures its database schema exists then seeds default pages if needed.
- First-install seeding ensures a public `coming-soon` page exists on every new
  installation. Empty installations set it as the start page, store its id in
  `MAINTENANCE_PAGE_ID` and enable `MAINTENANCE_MODE`.
- The Coming Soon seed saves a Design Studio design through `designer.saveDesign`
  when the core Designer adapter is available, then links the page through
  `meta.designId`. The seeded design is a dashboard-styled Design Studio tech
  preview built from first-party public widgets so a fresh install immediately
  demonstrates an editable public page. The static page HTML remains as a
  matching fallback so installs still succeed if Designer is unavailable.
- Public Design Studio previews render through the public widget loader's
  static canvas. It preserves saved percent bounds from the seed design and
  lets the linked HTML stay fallback-only, which keeps first-install previews
  from duplicating content.
- The seed is idempotent: pages marked with `meta.seedKey: "core.comingSoon"`
  and the retired raw HTML seed may be upgraded to the latest seed version, but a user-created
  `coming-soon` page without seed metadata is not overwritten.

## Purpose
- Provides events to create, retrieve and update pages.
- Can generate an XML sitemap and manage the start page.
- Acts as the page projection facade while Content Engine becomes the canonical
  content domain.
- Admin/editor callers should use `runtimeManager`'s `cmsAdminApiRequest`
  resource `pages` for page reads and writes. Direct page events are internal
  module contracts and are not exposed through `/api/meltdown`.

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
- Pages with `meta.designId` or `meta.design_layout` use that linked Design
  Studio layout in the public envelope. Their stored HTML is marked as a
  fallback-only attachment so the page remains readable if the design cannot
  load, but it does not duplicate a successfully rendered Design Studio layout.

A shared, framework-agnostic orchestrator and loader registry live under
`ui/runtime/envelope/`. PlainSpace, Vue, or React clients on the
same origin should import `/ui/runtime/envelope/orchestrator.js` and
`/ui/runtime/envelope/loaderRegistry.js` to process envelopes. The old
new code should use the `/ui/runtime/envelope/*` URLs directly.

## Content Engine Bridge
- Successful `createPage` and `updatePage` writes are mirrored to
  `contentEngine` as `page` entries.
- `setAsDeleted` also trashes the mirrored Content Engine entry by source id,
  so deleted page projections disappear from canonical content queries.
- Mirrored entries use `sourceModule: "pagesManager"` and `sourceId` equal to
  the source page id, so Content Engine can resolve future updates through
  `getContentEntryBySource`.
- The mirror is optional and non-blocking for page behavior. If Content
  Engine is not loaded or returns an error, the original page event still
  returns its normal result.
- Core importers may pass `skipContentMirror: true` when creating page
  projections for content that was already imported through Content Engine. This
  avoids duplicate canonical entries while still exposing parent/child
  collection structure to the current Pages UI.
