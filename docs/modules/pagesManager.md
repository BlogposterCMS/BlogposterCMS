# Pages Manager

Responsible for CRUD operations on pages and for generating default pages when the CMS starts.

## Startup
- Core module; ensures its database schema exists then seeds default pages if needed.

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
- `updatePage`
- `setAsDeleted`
- `searchPages`
- `setAsStart`
- Uses a MongoDB transaction when available so the old start flag is cleared
  atomically before assigning a new one.
- `generateXmlSitemap`

Permissions are checked for each sensitive operation to avoid unauthorized modifications.

## Returned Data
- Page retrieval events (`getPageBySlug`, `getPageById`, `getPagesByLane`) include a `parentSlug` field with the slug of the parent page when available.
