# designer

The `designer` module persists full design definitions for the standalone Designer app using the event bus.
It demonstrates how community modules provision their own schema and run CRUD operations
without touching database drivers directly. At startup it registers its transactional
`DESIGNER_SAVE_DESIGN` placeholder via `registerCustomPlaceholder`, allowing the module to be
removed without leaving database hooks in the core. The placeholder provides code paths for
PostgreSQL, MongoDB and SQLite so deployments on any supported database can save designs. The
Designer UI runs inside an iframe (`admin/app/designer`) so its styles and scripts remain isolated
from the dashboard.
It communicates with the dashboard via `window.postMessage`; events are forwarded to the
server through `appLoader`'s `dispatchAppEvent` handler.

## Startup
- Loaded from `modules/designer` when present.
- Exports `initialize({ motherEmitter, jwt, nonce })`.
- On start it:
  - emits `createDatabase` to provision its own database or schema.
  - applies `schemaDefinition.json` through `applySchemaDefinition` to create required tables across supported databases. In PostgreSQL these tables live under the `designer` schema (`designer.designer_designs`, etc.).

## Purpose
- Stores design metadata including draft status (`is_draft`) and background fields (`bg_color`, `bg_media_id`, `bg_media_url`) with versioning in `designer_designs`. `bg_color` accepts hex or `rgb(a)` values which are normalized to hex on save. Thumbnails are uploaded through the media manager and only the resulting share link is persisted.
- Persists widget instances and coordinates in `designer_design_widgets` with z-index, rotation and opacity.
- Saves per-widget HTML/CSS/JS and arbitrary metadata in `designer_widget_meta`.
- Tracks change history via `designer_versions`.
- Reads existing grid background styles so saves retain previously selected media without requiring a new selection.
- Applies stored `bg_color` and `bg_media_url` when loading a design so the builder preview reflects the saved background.
- When editing an existing design, the builder preloads `data-design-id` and
  `data-design-version` from `#builderMain` (or `document.body`) so subsequent
  saves update the original record instead of inserting duplicates.

## Listened Events
- `designer.saveDesign` – returns `{ id, version, updated_at }`; clients must reuse `id` and `version` on subsequent saves to avoid conflicts.
- The publish panel supplies this configuration to `designer.saveDesign` before publishing so the persisted design reflects the latest edits.
- `designer.listDesigns` – returns `{ designs: [...] }` with all non-deleted designs ordered by `updated_at`.
- `designer.getDesign` – accepts `{ id }` and returns `{ design, widgets: [...] }` for rendering a specific saved design.

## Security Notes
- Sanitises design titles and widget HTML/CSS before storage.
- HTML sanitization uses the server-side `sanitize-html` library with default tag and attribute allowlists plus inline style filtering for stronger XSS protection.
- Coordinates are clamped to `[0,100]` server side.
- Registers a custom transactional placeholder (`DESIGNER_SAVE_DESIGN`) for atomic saves and optimistic locking via a `version` field.
- Every database call includes the loader issued `jwt` and module information.
- CSRF and admin tokens are delivered via `postMessage` from the dashboard instead of inline scripts to satisfy strict CSP policies.

## Grid configuration
- The builder relies on `PixelGrid` with a 1px baseline and disables push-on-overlap,
  live snapping and percentage mode for precise positioning without moving
  neighbouring widgets.
