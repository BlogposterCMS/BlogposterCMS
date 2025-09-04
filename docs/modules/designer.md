# designer

The `designer` module persists full design definitions for the standalone Designer app using the event bus.
It demonstrates how community modules provision their own schema and run CRUD operations
without touching database drivers directly. The Designer UI runs inside an iframe
(`admin/app/designer`) so its styles and scripts remain isolated from the dashboard.
It communicates with the dashboard via `window.postMessage`; events are forwarded to the
server through `appLoader`'s `dispatchAppEvent` handler.

## Startup
- Loaded from `modules/designer` when present.
- Exports `initialize({ motherEmitter, jwt, nonce })`.
- On start it:
  - emits `createDatabase` to provision its own database or schema.
  - applies `schemaDefinition.json` through `applySchemaDefinition` to create required tables across supported databases.

## Purpose
- Stores design metadata and background styles (color plus media manager object IDs) in `designer_designs`.
- Persists widget instances and coordinates in `designer_design_widgets`.
- Saves per-widget HTML/CSS/JS and arbitrary metadata in `designer_widget_meta`.
- Tracks change history via `designer_versions`.

## Listened Events
- `designer.saveDesign` – returns `{ success, id }`; clients should reuse the returned `id` when saving again to update the existing design.

## Security Notes
- Sanitises design titles to avoid injection or log issues.
- Every database call includes the loader issued `jwt` and module information.
- Uses high level `dbInsert`, `dbUpdate` and `dbDelete` events to avoid raw SQL.
- CSRF and admin tokens are delivered via `postMessage` from the dashboard instead of inline scripts to satisfy strict CSP policies.

## Grid configuration
- The builder relies on `PixelGrid` with a 1px baseline and disables push-on-overlap,
  live snapping and percentage mode for precise positioning without moving
  neighbouring widgets.
