# Pages Manager

Responsible for CRUD operations on pages and for generating default pages when the CMS starts.

## Startup
- (public token required) Core module; ensures its database schema exists then seeds default pages if needed.

## Purpose
- Provides events to create, retrieve and update pages.
- Can generate an XML sitemap and manage the start page.

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

## Returned Data
- Page retrieval events (`getPageBySlug`, `getPageById`, `getPagesByLane`) include a `parentSlug` field with the slug of the parent page when available.
- Each page also exposes a `weight` integer (default `0`). Admin interfaces sort header and sidebar menus using this field.
- `getPagesByLane` accepts an optional `language` to limit translations to a single locale per page.
- **Update semantics:** `updatePage` only modifies the `weight` when the field is supplied. Omitting `weight` keeps the existing value.
- `getEnvelope` returns a `PageEnvelope` with ordered attachments describing design, HTML and widgets for the requested public page. Clients resolve attachments by importing `/modules/<source>/publicLoader.js` or `/mother/modules/<source>/publicLoader.js` and invoking its `registerLoaders` helper to wire the loaders into their orchestrator.

A shared, framework-agnostic orchestrator and loader registry live under `/assets/js/envelope/` so Plainspace, Vue, or React clients can import `/assets/js/envelope/orchestrator.js` and `/assets/js/envelope/loaderRegistry.js` to process envelopes.
