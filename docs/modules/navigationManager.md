# Navigation Manager

## Boundaries

Navigation Manager owns menu and location state as a core module. Public
renderers and UI surfaces read navigation through Runtime Manager's public route
or admin facade; they do not emit write events directly. Writes require the
navigation permission and a scoped `navigationManager` core payload. Public
runtime responses are filtered to active navigation items.

Core navigation and menu domain for public locations and structured menu trees.
The core module stays backend-only. The admin-facing editing surface is the
PlainSpace `navigationStudio` widget on the Content > Navigation Studio page.

## Startup
- Core module loaded after `contentEngine` and `commentsManager`.
- Ensures navigation schema/table/collection setup.
- Seeds default locations: `primary`, `footer` and `admin`.

## Purpose
- Registers public menu locations.
- Stores named navigation menus.
- Stores ordered menu items with optional parent-child nesting.
- Allows menu items to point to custom URLs, Content Engine entries or source-owned
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
- `runtimeManager` exposes `GET /api/public/navigation/:locationKey` for public
  widgets and frontend shells.
- The route requests `status: "active"` and performs an additional runtime
  filter so hidden or draft items are not returned even if a lower layer sends
  them back.
- Public menu widgets receive safe `meta` values. Central widgets and Builder
  settings own normal header/footer/mobile menu rendering, while Mega Menu items can carry
  `meta.mega.layoutId` as an optional Design Studio panel reference and still
  fall back to child links when no optional panel loader is present.

## Navigation Studio
- The admin widget reuses Navigation Manager events for all writes:
  `upsertNavigationMenu`, `addNavigationMenuItem`,
  `updateNavigationMenuItem`, `deleteNavigationMenuItem` and
  `getNavigationTree`.
- It seeds practical editing defaults when they are missing: Header Main,
  Mobile Menu, Footer Menu, Legal Menu and Sidebar / Blog.
- `Generate from pages` builds a curated starting menu from public
  parent/child pages, capped at three levels by default. After generation, the
  menu is independent and can be manually curated.
- Item `meta` carries UI-layer details such as icon, desktop/mobile
  visibility, and optional Mega Menu references. These fields do not make the
  menu a page or move menu design ownership out of central widgets and settings.
- The Studio chrome uses its own shadowless local card utility:
  `navigation-studio__card` is borderless by default, while
  `navigation-studio__card--bordered` remains an optional grey 2px border.
  The main structure is flat; one muted side surface groups link details,
  warnings and preview. All surfaces use Studio light/dark tokens.
- Menu selection lives in the header; the primary menu opens initially. Link
  details sit beside the structure and move below it when the widget is narrow.
  Add link opens a compact page/URL picker with an explicit parent destination;
  selecting an existing link for editing never silently nests new links.
- Structure changes save immediately through the existing navigation facade.
  Arrow controls support ordering, nesting and outdenting without drag. Nested
  drags retain the child id, cycles/depth limits are checked, and failed order
  writes refresh from Navigation Manager rather than showing an optimistic save.
- Link fields save explicitly. Search, preview, expansion and editing-mode
  changes retain the local draft. Menu/item switches ask before discarding it.
  Failed writes retain input and show a `NAV_STUDIO_*` error. These drafts are
  local to the mounted editor; leaving the admin page does not persist them.
- Page targets derive their URL from the chosen page. Conversion to a custom
  link clears source/entry ownership. Explicit null relationship patches take
  precedence over database snake_case aliases, including during outdent.
- Preview shows saved active links and device visibility, without navigating
  away when clicked. It is a structure preview; the public menu widget owns
  the final appearance. Advanced settings and Design Studio references are
  collapsed by default. Loading failures expose Retry.

## Notes
- Navigation URLs must be internal paths/fragments/queries, plain relative paths
  normalized to `/...`, or absolute `http`, `https`, `mailto` or `tel` links.
  Other schemes, protocol-relative links, backslashes, whitespace and control
  characters are stripped while items are normalized.
- `getNavigationTree` returns both the flat `items` list and a nested `tree`
  assembled from `parent_id`.
