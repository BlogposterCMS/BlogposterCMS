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

The builder now separates structure from content with distinct **Layout** and **Design** modes.
Layout mode swaps the widget sidebar for a layout panel placeholder, disables widget
interactions on the canvas and uses the existing header controls for saving. The header
back button exits the editor entirely, returning to the previous page (such as the design editor)
or falling back to the dashboard.
Switching back to design mode restores the widget sidebar and re‑enables normal editing.
Both editors share a footer with zoom controls, and the design sidebar now features a leading layout switch bubble for jumping to the layout editor.
Layouts without an explicit title initialise the header input to "Layout name" instead of a generic "default" tag.
Layout mode now exposes a container action bar above each layout leaf with controls to
add new containers, toggle the design surface, assign static designs and remove containers. The add control
opens a placement picker offering top, right, bottom, left or inside insertion points;
new containers split their parent 50/50, the star button designates the sole dynamic
host, updating badges automatically, and the design button stores a `designRef` so
static content can mount inside the container at runtime.

`#layoutRoot` now always acts as the root layout container. When no saved layout tree exists the builder seeds a leaf node,
assigns it a deterministic `nodeId`, and persists that node instead of the wrapper element. Subsequent splits or container moves
reuse these stable identifiers so workarea flags and `designRef` assignments survive reloads and publishing.

 The sidebar layout panel now lists the current container tree. Selecting an entry
 scrolls the canvas to the corresponding container and keeps its action bar in view.
 An arrange toggle enables drag-and-drop container reordering with undo/redo and autosave.

A runtime page loader now renders the resolved layout, mounts any static design references, locates the dynamic host (falling back to the largest leaf), and injects the page design when auto-mount is enabled. All backend requests include the correct JWT and module identifiers to satisfy auth checks.

Each layout node carries a stable `nodeId` so runtime mapping between the JSON tree and DOM elements remains deterministic.

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
  `data-design-version` from `#builderMain` (or `document.body`). These values
  are seeded from the `designId` and `designVersion` query parameters so saves
  update the original record instead of inserting duplicates. If a `designId`
  is provided, the builder now fetches the saved widgets via
  `designer.getDesign`, normalising snake_case widget fields to the builder's
  camelCase layout before rendering so editing a design no longer wipes its
  existing layout.
- The `designId` parameter is treated as an opaque string so non-numeric IDs
  (e.g. MongoDB ObjectIds) are preserved without coercion.

## Listened Events
- `designer.saveDesign` – returns `{ id, version, updated_at }`; clients must reuse `id` and `version` on subsequent saves to avoid conflicts. Passing `isLayout: true` stores the current layout in `designer_layouts` and marks the entry as a reusable layout template. An optional `isGlobal` flag records whether the layout is shared across designs.
- The publish panel supplies this configuration to `designer.saveDesign` before publishing so the persisted design reflects the latest edits.
- `designer.listDesigns` – returns `{ designs: [...] }` with all non-deleted designs ordered by `updated_at`.
- `designer.getDesign` – accepts `{ id }` and returns `{ design, widgets: [...] }` for rendering a specific saved design.
- `designer.listLayouts` – returns `{ layouts: [...] }` with all saved layouts.
- `designer.getLayout` – accepts `{ id }` to fetch a saved layout or `{ layoutRef }` (public token required) to resolve public layouts.

These listeners register during module initialization; seeing "No listeners for event designer.*" in the logs usually means the designer module failed to load.

The app loader verifies these events before launching the designer. If any required event is missing, the loader halts startup and informs the user instead of letting requests hang. The designer's `app.json` lists these under `requiredEvents`.

## Preview Capture
- The builder fetches external font stylesheets (currently allowing only same-origin and Google Fonts) before calling `html-to-image` so previews render with correct typography without touching cross-origin stylesheets.
- If the design save request does not complete within 20 seconds, the client now reports a timeout to the user for clearer error handling.

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
