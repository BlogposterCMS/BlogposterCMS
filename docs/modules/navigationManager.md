# Navigation Manager

## Boundaries

Navigation Manager owns menu and location state as a core module. Public
themes and UI surfaces read navigation through Runtime Manager's public route
or admin facade; they do not emit write events directly. Writes require the
navigation permission and a scoped `navigationManager` core payload. Public
runtime responses are filtered to active navigation items.

Core navigation and menu domain for theme locations and structured menu trees.
It is backend-only and does not add UI screens by itself.

## Startup
- Core module loaded after `contentEngine` and `commentsManager`.
- Ensures navigation schema/table/collection setup.
- Seeds default locations: `primary`, `footer` and `admin`.

## Purpose
- Registers theme/menu locations.
- Stores named navigation menus.
- Stores ordered menu items with optional parent-child nesting.
- Allows menu items to point to custom URLs, Content Engine entries or legacy
  source pairs such as `sourceModule: "pagesManager"` plus `sourceId`.

## Listened Events
- `registerNavigationLocation`
- `listNavigationLocations`
- `upsertNavigationMenu`
- `getNavigationMenu`
- `listNavigationMenus`
- `addNavigationMenuItem`
- `setNavigationMenuItems`
- `updateNavigationMenuItem`
- `deleteNavigationMenuItem`
- `getNavigationTree`

## Permissions
- `navigation.manage` is required for location/menu/item writes and for listing
  draft or hidden navigation items.
- User-facing calls without `navigation.manage` only receive `active` items from
  `getNavigationTree`.

## Public Runtime
- `runtimeManager` exposes `GET /api/public/navigation/:locationKey` for themes
  and frontend shells.
- The route requests `status: "active"` and performs an additional runtime
  filter so hidden or draft items are not returned even if a lower layer sends
  them back.

## Notes
- Navigation URLs must be internal paths/fragments/queries, plain relative paths
  normalized to `/...`, or absolute `http`, `https`, `mailto` or `tel` links.
  Other schemes, protocol-relative links, backslashes, whitespace and control
  characters are stripped while items are normalized.
- `getNavigationTree` returns both the flat `items` list and a nested `tree`
  assembled from `parent_id`.
