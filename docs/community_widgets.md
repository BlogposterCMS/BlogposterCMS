# Community Widgets

Community widgets are public UI assets, not backend capabilities.
They follow the [Widget Design Contract](widget_design_contract.md) in
advisory mode: design drift is reported as warnings, while security and
capability-boundary violations still block registration.

Manage the widget catalog, ZIP installation and installed access under
**Settings > Widgets** (`/admin/settings/widgets`). Place and edit public widgets
in Design Studio. Admin-page seeding moves the former `content/widgets` page
to Settings while retaining its page ID and saved state.

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


## Operator-approved integration

Widgets may use `context.services` for named operations, bounded SSE subscriptions,
unsent drafts and locale/theme preferences configured by the site operator through
Settings Manager. This does not permit direct credential, storage or event-stream
access in widget scripts. See [Public widget services](widget-services.md) for the
contract, preview restrictions and server-side authorization requirements.

## Install ZIP and manage access

Open the store icon at the right of the main navigation and select Widget. Drop one ZIP onto
the dialog's dropzone or click it to choose a file on your computer (maximum 10 MiB).
Package exactly one folder with `widget.js` and `widgetInfo.json`. UI packages
must declare `version` and `requestedAccess`, including an empty array for a
presentation-only widget. For example:

```json
{
  "widgetId": "notes",
  "widgetType": "public",
  "label": "Notes",
  "category": "Content",
  "version": "1.0.0",
  "requestedAccess": [
    { "service": "draft", "name": "draft", "reason": "Keep unsent notes", "required": false },
    { "service": "operation", "name": "search", "reason": "Find public entries" }
  ]
}
```

Services are `operation`, `draft` (name `draft`) or `preference` (name `locale`
or `theme`). Declarations cannot provide events, destinations, credentials or
Settings values. The site operator must already have configured the underlying
service in `PUBLIC_WIDGET_SERVICES`. The review shows that configured operation;
unconfigured services stay disabled. Confirmed grants are stored in that setting's
widget entry as `packageAccess`, separate from the package files and public metadata.

Use **Manage installed access** to select a package and replace its allowed service
set. Install requires `widgets.create` and `settings.core.edit`; managing grants
requires `widgets.update` and `settings.core.edit`. Registry visibility remains on
the existing Widget Manager/PlainSpace contracts. A successful install appears in
the existing Designer widget catalog without a server restart. Duplicate IDs are
rejected rather than overwriting existing widgets. ZIP inspection executes no code.

A manifest and the existing static scanner are not a JavaScript sandbox. Only
install reviewed, trusted widget code. Revoking service access does not make a
public endpoint private; the endpoint must enforce its own authorization.
