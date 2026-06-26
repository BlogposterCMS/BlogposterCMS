# Widget Manager

Stores widgets used by both the public site and the admin dashboard.

## Startup
- Core module; creates `widgets_public` and `widgets_admin` tables.
- Automatically registers public widgets found under `widgets`.
- A community widget folder name must match `widgetInfo.widgetId`.
- Enforces the [Widget Design Contract](../widget_design_contract.md) in strict
  mode for trusted/admin/core/generated widgets and advisory mode for community
  widgets.

## Purpose
- CRUD events for widgets.
- Allows saving page layouts via `saveLayout.v1`.
- Registers community widgets as UI assets, not backend capabilities.
- The public `widgets` loader renders from the current page envelope/context
  layout first and only falls back to legacy `window.__BP_ACTIVE_LAYOUT__`
  state for older loaders, so one page's loaded widget layout cannot bleed into
  another page.
- Community widget folders can only register `widgetType: "public"`; admin
  widgets belong to trusted UI modules.
- Community widget metadata cannot declare `moduleType`; widgets are not core
  or community modules.
- Community widget metadata cannot declare app identity fields (`appName`,
  `appType`) or module identity fields (`moduleName`, `moduleType`).
- Rejects widget folders that contain `app.json` or `moduleInfo.json` at any
  depth, and rejects nested `widgetInfo.json`; apps, modules and widgets have
  their own installation roots and registries.
- Rejects `.env*`, package manager config files, package manifests/lockfiles
  and `node_modules` inside community widget folders. Widgets are browser UI
  assets, not deployable Node packages.
- Resolves community widget folders through real paths and keeps both
  registration and `/widgets` static delivery inside the configured widgets
  root.
- Rejects symlinks and junctions inside community widget folders; widget assets
  must be real files under the widget directory.

## Listened Events
- `createWidget`
- `getWidgets`
- `updateWidget`
- `deleteWidget`
- `saveLayout.v1`

Widget operations enforce permissions, ensuring admin widgets are not accessible to the public lane.
Raw widget events require `jwt`, `moduleName: "widgetManager"` and
`moduleType: "core"`. Other modules and apps should query or mutate widgets
through the runtime/admin facades instead of impersonating widget ownership on
the event bus.
Mutating widget management events (`createWidget`, `updateWidget`,
`deleteWidget` and `saveLayout.v1`) are not public `/api/meltdown` targets.
Admin/editor surfaces should call `runtimeManager.cmsAdminApiRequest` with the
`widgets` resource so widget changes stay behind the audited CMS facade.

## Boundaries

Community widget scripts are scanned before registration. The scanner checks
every `.js`, `.mjs` and `.cjs` file in the widget folder, not just the root
`widget.js`. It rejects scripts that try to use Node-style APIs, admin tokens,
token metadata,
`/api/meltdown`, `meltdownEmit`, authenticated fetches, remote fetch/import
URLs, same-origin admin/internal API fetches, WebSocket/EventSource/sendBeacon,
browser storage, cookies, `eval`, the `Function` constructor or
`XMLHttpRequest`. Widgets should render UI and query public read contracts such
as `/api/public/...`; they must not reach into backend internals.

Community widgets are not apps or modules. A widget folder may provide
`widgetInfo.json` and `widget.js`; app manifests and module manifests are
rejected so each add-on type keeps one purpose and one loader. A widget
folder may only contain one root `widgetInfo.json`, that manifest's `widgetId`
must match the folder name, and that manifest cannot claim app or module
identity; nested widget manifests, package metadata and runtime dependency
folders are refused during scanning.

Design-only contract drift is reported as
`[WIDGET MANAGER:WIDGET_DESIGN_CONTRACT_WARNING]` with a
`BP_WIDGET_CONTRACT_*` code for community widgets. Strict widgets fail
registration with `[WM:WIDGET_DESIGN_CONTRACT]` when they use an untrusted
source root, omit a v1 inline design contract, or mutate global document styles.
