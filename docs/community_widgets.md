# Community Widgets

Community widgets are public UI assets, not backend capabilities.
They follow the [Widget Design Contract](widget_design_contract.md) in
advisory mode: design drift is reported as warnings, while security and
capability-boundary violations still block registration.

## Folder Structure

Community widgets live under `widgets/{folderName}`. Folder names may contain
only letters, numbers, underscores and dashes. Each widget folder contains:

- `widget.js`: client-side rendering code.
- `widgetInfo.json`: registration metadata with `widgetId`,
  `widgetType: "public"`, `label` and `category`. It must not declare
  `moduleType`; widgets are UI assets, not modules.

System and Blogposter widgets live under `ui/widgets/plainspace/`. Bundled
widget URLs must use `/ui/widgets/plainspace/...`; community widget URLs must
use `/widgets/{folderName}/widget.js`. Keeping community code separate avoids
mixing trusted admin UI with unknown widget code.
The server exposes `widgets/` at `/widgets/` as static browser assets with
TypeScript source requests blocked; community widgets should ship JavaScript
browser modules only.
Widget folders must not include `app.json`, `moduleInfo.json`, nested
`widgetInfo.json`, `.env*`, package-manager config files, package
manifests/lockfiles or `node_modules`. A community widget is a browser asset
package, not an app, module or Node runtime.

## Registration

The Widget Manager scans the community folder during startup:

1. Read `widgetInfo.json` and validate the required fields.
2. Read `widget.js` and run the static security scanner.
3. Validate the folder shape and register the widget through the core
   `createWidget` event with `content` pointing at
   `/widgets/{folderName}/widget.js`.

Community metadata does not declare backend events. Community widgets are
registered as assets only; they do not gain direct `motherEmitter`, Meltdown,
raw database, token or module access, and they cannot claim a core module role.

## Security Rules

- Community widgets must render UI and may query public read APIs.
- Community widgets must be public widgets. Admin widgets are trusted UI modules
  under `ui/widgets/plainspace/`, not files loaded from
  `widgets/`.
- They must not call `/api/meltdown`, `meltdownEmit`, raw core events, admin
  tokens, CSRF token metadata, cookies, authenticated fetches, browser storage,
  remote fetch/import URLs, WebSocket/EventSource/sendBeacon, `eval`, the
  `Function` constructor, Node `require`, `process`, or filesystem APIs.
- Administrators can remove a community widget by deleting its folder and using
  the trusted admin UI to delete the database row.

This keeps custom widgets useful for presentation while preserving the
architecture boundary: modules own backend behavior, apps use the read-only app
bridge, and community widgets stay as isolated UI assets.

## Design Contract

Community widgets should use Blogposter design tokens with `var(--...)`, keep
styles scoped to their own widget root, and avoid raw color literals or global
document styling. The Widget Manager reports `BP_WIDGET_CONTRACT_*` warnings
for design-only drift but does not block community registration unless the
existing security scanner also finds a hard violation.

Bundled, admin, core, and generated widgets are stricter: those must satisfy
the v1 design contract before registration so first-party surfaces stay aligned
with the Designer and shell tokens.
