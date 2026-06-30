# designer

User-facing surfaces call this app **Design Studio**. The public resource and
event names remain `designer` because they are the v1 Designer domain
contract. `/admin/studio/design` is the preferred user-facing entry and
redirects to `/admin/app/designer`.

## Boundaries

The `designer` backend domain is owned by the core `designerManager` service.
Designer UI code runs as an app surface and reaches backend behavior through
AppLoader and Runtime Manager contracts, not by emitting arbitrary core events
or receiving the admin token. `designer.*` backend events stay scoped to the
core Designer service.

The `designer` backend persists full design definitions for the standalone Designer app using the event bus.
It is owned by the core `designerManager` service because it provisions schema and
executes transactional database placeholders for a first-party app. At startup it registers its transactional
`DESIGNER_SAVE_DESIGN` placeholder via `registerCustomPlaceholder`, allowing the module to be
removed without leaving database hooks in the core. The placeholder provides code paths for
PostgreSQL, MongoDB and SQLite so deployments on any supported database can save designs. The
Designer UI runs inside an iframe (`admin/app/designer`) so its styles and scripts remain isolated
from the dashboard.
It communicates with the dashboard via `window.postMessage`; events are forwarded to the
server through `appLoader`'s `dispatchAppEvent` handler.
The iframe runs sandboxed without Same-Origin access to the dashboard. The
dashboard keeps the admin token parent-side and exposes a request/response
bridge; Designer `meltdownEmit` calls are forwarded only through AppLoader's
validated app bridge. The app declares `agentSurface: true`, so the
AgentManager surface events come from the central AppLoader expansion rather
than a Designer-only bridge contract.

Designer startup waits for both the signed origin policy and the app-frame init
tokens before booting the builder. Sandboxed frames can throw when code touches
browser storage or cross-origin stylesheet rules, so iframe code must use the
shared app bridge, safe storage guards and the no-preview fallback instead of
assuming direct same-origin browser APIs are available.

Designer publishes a `studio-builder` surface through
`ui/designer/app/agentSurface.ts`. The surface snapshot includes sections,
layers, selection, behavior controls, timeline/range metadata, an optional
visual stage preview and an action catalog for scene, element and behavior
commands. Agent controllers enqueue commands through `agentManager`; Designer
polls and acknowledges them like any other surface.

Design Studio agent feedback extends that same surface instead of adding
DOM-scraping helpers. Each snapshot now carries a versioned
`design-studio.agent-feedback` block as `feedback`, `state.feedback` and
`meta.agentFeedback`. It exposes the current design id, active viewport,
`LayoutTree`, widget placements, selected element, Style Source relationships,
warnings and stable bounds for visible objects. Visual feedback remains an
optional preview image plus structured bounds so an agent can compare what it
sees with the editable contract. Agent writes stay command-based through
AgentManager/AppLoader actions such as select, insert, set properties, link or
unlink a Style Source, save and publish. Do not expose every internal Designer
function as an agent action; if a command family such as exact move/resize
bounds is missing, document that missing adapter in
`docs/design-studio-agent-feedback.md` and keep the core domain logic behind the
existing service and permission boundaries.

Follow the Design Studio agent feedback guide in
`docs/design-studio-agent-feedback.md` when changing canvas rendering, layout
containers, widget placement, Style Source behavior, selection state,
save/publish state or visual previews. Changes in those areas must update
`ui/designer/app/agentSurface.ts`, the focused test contract and docs together.

The builder now separates structure from content with distinct **Layout** and **Design** modes.
Layout mode swaps the widget sidebar for a layout panel placeholder, disables widget
interactions on the canvas and uses the existing header controls for saving. The header
back button exits the editor entirely, returning to the previous page (such as the design editor)
or falling back to the dashboard.
Switching back to design mode restores the widget sidebar and re‑enables normal editing.
Both editors share a footer with zoom controls, and the design sidebar now features a leading layout switch bubble for jumping to the layout editor.
Layouts without an explicit title initialise the header input to "Layout name" instead of a generic "default" tag.
Layout mode now exposes a floating container toolbar above the active page or
container surface. It can add a container using the parent rule, open the manual
placement picker, switch stack/row/free mode, adjust gap, padding and
background, follow or unlink a Style Source, toggle the design surface, assign
static designs and remove containers. Automatic container inserts follow the
selected parent mode:
`stack` creates vertical flow, `row` creates horizontal flow and `free` keeps
CanvasGrid-style absolute placement inside the active workarea. The star button
designates the sole dynamic host, moving the free-placement canvas into that
workarea, and the design button stores a `designRef` so static content can
mount inside the container at runtime.
When a new sibling container is created, the first sibling becomes the Style
Source and later siblings can follow its layout/design properties without
copying its content. Each follower can be unlinked from the toolbar.
Toolbar actions, container refreshes and shared layout callbacks are guarded:
unexpected failures are logged with `DESIGNER_CONTAINER_*` or
`LAYOUT_CONTAINER_AFTER_CHANGE_FAILED` codes and must not break the surrounding
Studio shell.

Layout terminology is explicit:

- `LayoutTree` means structural nodes: sections, splits, leaves, workareas and
  static `designRef` assignments.
- `WidgetPlacement` means canvas/grid widget coordinates and widget metadata.
  Placements include the nearest `workareaId` when a layout container owns the
  active design surface.
- `StyleSource` means reusable style/layout metadata shared by containers or
  widget placements. Followers copy source properties, not content.
- `DesignDocument` means the saved runtime contract: `LayoutTree` plus
  placements, scenes, styles and metadata.

The shared source of truth for this contract lives under `ui/shared/layout/`.
Designer adapter modules such as
`ui/designer/app/renderer/layoutSerialize.js` and
`ui/designer/app/managers/layoutContainerManager.js` forward to that shared core
instead of owning separate serialization or container operations.

## Loading feedback & error recovery

The designer iframe now renders accessible skeleton placeholders before each sidebar or
panel partial resolves. The placeholders prevent layout shift while indicating progress.
If any partial fails to load, the iframe injects an inline alert inside the affected
region so authors understand what went wrong and how to recover without opening the
developer console. The alerts reuse the CMS colour tokens and follow the CSP rules—no
inline scripts or unsanitised markup are required.

## Renderer module structure

The builder renderer now splits major responsibilities into focused helpers so the
entry point coordinates features instead of re-implementing them inline:

- `ui/designer/app/renderer/builderHeader.ts` loads the header partial, wires save/
  preview/publish buttons and exposes an autosave toggle.
- `ui/designer/app/renderer/previewHeader.js` manages the responsive viewport header shown
  during preview mode.
- `ui/designer/app/renderer/layoutBar.js` renders the zoom controls that live in the footer.
- `ui/designer/app/renderer/layoutStructureHandlers.js` refreshes container bars and the
  layout tree sidebar whenever containers change.
- `ui/designer/app/managers/layoutContainerManager.js` owns DOM manipulation for placing,
  moving and deleting layout containers while keeping workarea metadata in sync.
- `ui/designer/app/managers/historyManager.js` centralises undo/redo stacks so widget edits
  and container changes share a single history implementation.

`ui/designer/app/builderRenderer.ts` now imports these helpers and focuses on orchestration:
initialising the editor, wiring autosave, switching layers and coordinating widget events.

The renderer entry point delegates specific responsibilities to focused helpers:

- `createAutosavePipeline()` prepares autosave scheduling and history snapshots.
- `setupWidgetInteractions()` wires selection, drag/resize handling and background toolbar behaviour.
- `initializeHeaderSection()` loads the header partial and returns a controller for rerendering on layer changes.
- `preparePublishPanelContainer()` ensures the publish panel host exists and stays hidden until explicitly opened.
- `ui/designer/app/renderer/publishPanel.ts` handles publish flow UI, slug suggestions and upload orchestration while sharing the builder logger for consistent diagnostics.

`apps/designer/` contains the iframe shell, assets, partials and app metadata.
Designer implementation work belongs under `ui/designer/app/`, with bundle
entries in `ui/designer/entries/`.

`#layoutRoot` now always acts as the root layout container. When no saved
layout tree exists the builder seeds a leaf node, assigns it a deterministic
`nodeId`, treats it as the default free-placement workarea and persists that
node instead of the wrapper element. Subsequent splits or container moves reuse
these stable identifiers so workarea flags, container settings and `designRef`
assignments survive reloads and publishing.

 The sidebar layout panel now lists the current container tree. Selecting an entry
 scrolls the canvas to the corresponding container and keeps its action bar in view.
 An arrange toggle enables drag-and-drop container reordering with undo/redo and autosave.

A runtime page loader now renders the resolved layout, mounts any static design references, locates the dynamic host (falling back to the largest leaf), and injects the page design when auto-mount is enabled. The public runtime path also reads a saved Design Studio `DesignDocument`; when a design includes a `LayoutTree`, it renders the tree first and mounts widget placements into the primary workarea instead of immediately flattening the design into a single grid. All backend requests include the correct JWT and module identifiers to satisfy auth checks.

Each layout node carries a stable `nodeId` so runtime mapping between the JSON tree and DOM elements remains deterministic.

## Startup
- Loaded as core module `mother/modules/designerManager`.
- Owns Designer service handlers, placeholders, schema and public loader from
  `mother/modules/designerManager`.
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
- Sanitises design titles and widget HTML/CSS before storage, and the runtime page loader sanitises design HTML again before injecting it into the DOM.
- HTML sanitization uses the server-side `sanitize-html` library with default tag and attribute allowlists plus inline style filtering for stronger XSS protection.
- Only designs marked with trust metadata (for example `allowCustomJs`) execute stored JavaScript at runtime. The runtime only treats explicit boolean `true` values or the string/number literals `'1'`, `'true'`, `'yes'`, `'y'` or `'on'` as trusted; ensure this flag is available exclusively to trusted authors and avoid serialising other values.
- Coordinates are clamped to `[0,100]` server side.
- Registers a custom transactional placeholder (`DESIGNER_SAVE_DESIGN`) for atomic saves and optimistic locking via a `version` field.
- Every database call includes the loader issued `jwt` and module information.
- The service emits as `moduleType: "core"`; community modules cannot use these
  schema or database-operation paths directly.
- Raw `designer.*` events are not exposed as public `/api/meltdown` bus calls.
  Admin callers use Runtime Manager's `cmsAdminApiRequest` Designer resource,
  while public Design and layout reads use `cmsPublicRuntimeRequest`; layout
  reads require a public `layoutRef` and return only the renderable grid/items
  contract.
- CSRF bootstrap data is delivered via `postMessage`; the admin token remains in
  the parent dashboard and is never posted into the iframe. Designer backend
  requests use the AppLoader bridge, which injects the validated admin principal
  server-side.

## Grid configuration
- The builder uses the shared CanvasGrid with 12 columns, percentage-mode
  coordinates, disabled push-on-overlap and disabled live snapping. Layout
  containers are structural nodes; regular widgets should not duplicate
  sections, rows or columns as widget types.

## Sidebar panels
- The Design Studio sidebar uses one stable rail shell with circular panel
  buttons for Widgets, Sections, Layers and Layout. Widgets are the compact
  default state and render as icon circles; the section list, layer list and
  layout tree expand into their own panels instead of replacing the whole
  sidebar.
- The Widgets panel now renders grouped insert circles for Text, Media, Shape,
  Button, Navigation and Content. Clicking a circle expands only that group into a
  preset panel. The raw public widget registry is no longer dumped into the
  default sidebar, so `textBox`, `mediaBlock`, `buttonLink`, `gallery`,
  `navigationMenu`, `breadcrumb` and `collectionArchive` stay technical
  renderers while authors pick task-focused presets.
- `ui/designer/app/renderer/layoutMode.js` may load the Layout partial into
  `.layout-panel-host`, but it must not rebuild the rail shell when leaving
  Layout mode. The shell owns the active panel state so rendered section and
  layer lists remain intact across Layout/Design layer switches.

## Native element presets
- Quick insert actions for text, media, shape and button resolve through
  `ui/designer/app/widgets/nativeElementPresets.js`. These presets create
  first-party widget payloads with versioned metadata and Design Contract v1
  information, while the Designer renderer only coordinates placement and
  widget creation.
- Text, media and button presets prefer metadata-only payloads for first-party
  public widgets. `htmlBlock` remains available as an advanced/importer
  fallback but is hidden from normal catalogs.
- The initial bundled public widget set now covers `textBox` as Rich Text plus
  `mediaBlock`, `buttonLink`, `navigationMenu`, `breadcrumb`, `gallery`, and
  `collectionArchive`.
  Quick-insert media and button presets prefer those concrete public widgets
  before falling back to `htmlBlock`. The Content insert group exposes
  `collectionArchive` for selected parent/child page collections instead of
  reusing the admin dashboard page-list widget.
- Gallery widgets store layout mode, rows/columns, height strategy, default
  object fit/focus, per-image fit/focus and carousel animation controls in
  `code.meta`. The Designer renderer treats metadata-only widget data as module
  settings so these controls do not force a custom HTML/CSS/JS override.
- Collection Archive widgets store `collectionId`, columns and button text in
  `code.meta`; the public renderer loads child pages through
  `pagesManager.getChildPages` and renders cards with image, title, SEO
  description and link action.
- The first required Design Studio widget inventory is documented in
  `docs/design_studio_widgets.md`. Layout primitives remain part of
  `DesignDocument.layoutTree` and must not be duplicated as normal widgets.
