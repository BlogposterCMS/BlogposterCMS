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

The catalog uses the existing
`window.blogposterDesignerCommands.execute` adapter. It includes shared
viewport controls, scene reorder/delete, exact element grid geometry,
stacking/duplicate/delete, direct text formatting, layout container and Style
Source operations, current Site Preset capture and save/publish commands.
These commands call the existing Builder managers and services; they are not a
second Designer state owner or transport.

The same surface exposes central Color Schemes through `state.colorLibrary`,
`meta.colorLibrary` and command-based `colorLibrary.*` actions. Design Studio
loads them through Runtime Manager, applies stable numbered CSS variables and
stores linked Default selections with literal fallbacks. The visible picker,
public runtime and agent surface all use
`ui/shared/colors/colorLibrary.ts`; direct colors, `userColor` and Style Sources
remain separate domains.

Font resources and typography defaults remain separate. `fontsManager` provides
the available families, while the `fontPackages` resource stores named semantic
defaults for Body, H1-H6, Paragraph, Link, Button, Label, Small, Quote and Code.
The sidebar presents `Color scheme` and `Font packages` as independent panels.
`state.fontPackages`, `meta.fontPackages` and command-based `fontPackages.*`
actions mirror the same package service. The text toolbar keeps direct font
selection; its `Default` choice removes the inline family so the active package
role applies again. It also shows `Default` versus `Local override`; resetting
clears direct typography and text-color styles so the active Font Package and
Color Scheme apply again. Both panels identify themselves as global defaults,
while their editors explicitly reapply stored values on role or slot changes so
browser form restoration cannot replace the selected scheme data.

The Layout panel also exposes Site Presets without adding another primary rail
mode. Installed and user-created packages use the same declarative contract for
Builder settings, one Color Scheme, one Font Package and optional page demos
composed from central presets. `state.sitePresets`, `meta.sitePresets` and
command-based `sitePresets.*` actions mirror that service; applying a preset
updates the central systems and does not add a public runtime dependency.
`sitePresets.create` captures the current Builder settings, active Color
Scheme, active Font Package and current central-preset page demo through the
same service as the visible Layout panel.

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
function as an agent action; if a future command family is missing, document
that adapter in
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
or falling back to the dashboard. Because Design Studio runs inside the sandboxed app frame
instead of the normal admin shell, that back control must remain visible as the first
left-side builder-header action.
Switching back to design mode restores the widget sidebar and re‑enables normal editing.
Both editors share a footer with zoom controls, and the design sidebar now features a leading layout switch bubble for jumping to the layout editor.
Layouts without an explicit title initialise the header input to "Layout name" instead of a generic "default" tag.

Viewport authoring and canvas zoom deliberately remain separate controls. The
header viewport band selects the responsive width and the width range in which
a selected element override applies. The footer zoom changes only the visual
magnification of the workspace and offers a Fit mode; it never changes saved
element geometry or the authored responsive width.

Responsive element placement extends the existing CanvasGrid placement metadata
instead of introducing another layout owner. A base pixel rectangle keeps its
width and height while the viewport changes, with its horizontal centre as the
stable anchor. Elements that fit are clamped fully inside the page. When an
element is wider than the selected viewport, its unavoidable overflow is
centred instead of being pushed to one side. Width-specific overrides use the
same placement record with explicit inclusive `minWidth`/`maxWidth` ranges and
are resolved identically by the Builder, Live Preview and public runtime.
Runtime grids reproject that record after their container width settles. A
full-width grid uses the nominal browser viewport when fractional device-pixel
rounding differs by less than one pixel, and the sandboxed Live Preview removes
only the visual scrollbar gutter. This keeps a requested 390px surface at
390px while retaining normal wheel and keyboard scrolling.

Every Section owns a compact floating toolbar, and a selected nested Container
uses the same local interaction language. The single mode icon cycles Free,
Auto and Grid; Auto retains its last vertical or horizontal direction.
Placement mode only controls layout gestures: active-layer widgets remain
selectable and open the same inspector and floating action bar in every mode.
The Section toolbar is inset at the top right of its own authored surface so it
does not overlap the centered Add Section control on the shared lower edge. The
toolbar can add or duplicate a nested Container, create an explicit linked
copy, adjust gap, padding, minimum height and background, unlink an existing
style relationship, toggle the design surface, assign static designs and
remove Containers. The active Section shows an editor-only boundary on all four
authored edges. Its two-pixel, Studio-token-based line fades and settles into
place briefly, follows the real Section size, remains legible at Fit zoom and
is never persisted into the public page. Reduced-motion preferences remove the
transition. A Section's bottom edge is also its resize handle, so authored
height does not require a parallel sidebar control. Its hit target and thumb
stay screen-sized at every Builder zoom, while pointer movement is converted
back into authored pixels before the Section minimum height is persisted. The
active Section keeps the filigree thumb visible near the lower-right edge,
separate from the centered Add Section action.
The same lower edge exposes the existing Add Section action. It inserts the
canonical Section immediately below that edge, scrolls the new surface into
view and briefly highlights it; reduced-motion preferences keep the
confirmation visible without movement.
The Section toolbar and storyboard share one delete path. Deleting removes the
Section together with its nested Containers and widgets, then activates a
remaining fallback Section; the final remaining Section is protected so the page
always keeps one valid authored surface.
The authored page root uses content-driven height, so every inserted Section
extends the same white canvas. Its CanvasGrid and widgets move with that
Section instead of remaining positioned against the original first-screen
height; the grey area stays editor surround only.
Clicking an empty part of a Section clears the current widget selection and its
floating action bar before opening the Section toolbar. This uses the
background pointer path because CanvasGrid may consume the later click event.
Scrolling the canvas hides the floating action bar without discarding the
selected widget or its inspector state; selecting the widget again restores
the local controls at its current position.
Automatic Container inserts follow the selected parent mode:
`stack` creates vertical flow, `row` creates horizontal flow and `free` keeps
CanvasGrid-style absolute placement inside the active workarea. The star button
designates the sole dynamic host, moving the free-placement canvas into that
workarea, and the design button stores a `designRef` so static content can
mount inside the container at runtime.
Creating or moving a Container never assigns a Style Source. `Duplicate`
creates a fully independent recursive copy. `Linked copy` clones the current
Container tree and widget contents once, gives every copied node and widget a
new stable id, and links only corresponding layout/design properties. Content
remains independent, and later structural additions or removals are not
mirrored. A follower shows only its linked state and an unlink action; unlinking
removes the relationship metadata completely.
Free Placement is the default authoring mode. Auto and Grid temporarily lock
direct child gestures; returning to Free clears only those temporary locks in
the same mutation turn, preserving explicit widget locks and inactive layers.
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
- `StyleSource` means an explicit reusable style/layout relationship created by
  `Linked copy` or an explicit command. Followers copy source properties, not
  content or later structure.
- `DesignDocument` means the saved runtime contract: canonical Section nodes in
  `LayoutTree` plus placements, styles and metadata. The extracted `scenes`
  view is compatibility-only and is derived from those nodes.

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
- `ui/designer/app/renderer/livePreviewFrame.ts` opens the current public page
  route with `?designer-live-preview=1`, serializes the current layout tree and
  widget placements, and bridges Runtime data requests back through the
  existing app bridge.
- `ui/designer/app/renderer/viewportState.ts` is the single persisted owner for
  Builder width, Desktop/Tablet/Mobile/custom state and zoom. The sandboxed
  Designer hydrates and persists it through the existing parent AppBridge;
  header, footer, Live Preview and agent feedback subscribe to it.
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

`#layoutRoot` now always acts as the page container and a fixed vertical stack.
Its direct children are canonical Sections with stable `nodeId` values. The
storyboard uses those same ids. Each Section owns one persistent CanvasGrid.
A nested Container is registered as one item in its parent CanvasGrid while its
same DOM node owns another CanvasGrid for direct children. Widget and Container
serialization therefore retain their immediate surface id as `workareaId`.
A legacy single workarea is migrated into the first Section without replacing
the root shell or losing its content.

The left Layout panel renders this recursive Section/Container hierarchy.
Selecting a row scrolls the canvas to that node. Dragging a Container row into a
Section or another Container explicitly changes its parent; cycle drops are
rejected. Normal canvas dragging remains local placement and never silently
reparents an item.

Section deletion filters placements by both canonical Section id and every
recursive grid-surface id before rebuilding the remaining composite layout.
This prevents content from a deleted Container grid from being reassigned to a
neighbouring Section.

A runtime page loader now renders the resolved layout, mounts any static design
references and injects each placement into its matching recursive grid
`workareaId`.
Placements without an id retain the primary-workarea fallback for legacy
documents. Website Body background is read from the public SettingsManager
allowlist; page and Section backgrounds then apply the same inheritance used
in the Studio.

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
- Loaded widget placements must write their saved percent bounds to the
  `.canvas-item` before CanvasGrid registration. `gs-w`, `gs-h`, `data-x` and
  `data-y` are derived edit-grid values; `data-x-percent`, `data-y-percent`,
  `data-w-percent` and `data-h-percent` remain the persisted geometry contract
  so a freshly loaded design renders at the saved size before any handle
  interaction.
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
- The header slider changes the editable canvas width.
  The header's Desktop/Tablet/Mobile buttons and footer zoom update the same
  state and survive Layout/Design header rebuilds and full page reloads. The
  sidebar does not duplicate those global controls. The canvas remains part of
  the Builder document; the Live Preview public-runtime iframe is the faithful
  surface for CSS media queries, viewport units and actual public page
  composition.
- The builder fetches external font stylesheets (currently allowing only same-origin and Google Fonts) before calling `html-to-image` so previews render with correct typography without touching cross-origin stylesheets.
- If sandbox policy prevents a DOM pixel capture, agent feedback draws a local
  PNG structure preview from stable element bounds and labels. Keeping the
  fallback rasterized matches AgentManager's existing image allowlist instead
  of widening the server to active SVG content. Saved design thumbnails do not
  use this diagnostic fallback.
- The header Preview button opens the page's public route with
  `?designer-live-preview=1`. That route loads the normal public frontend shell,
  then the preview adapter renders the current unsaved design through
  `renderPublicRuntimePageContent` so the preview and saved page share the same
  Runtime content contract.
- The preview iframe keeps the exact selected Builder width as its CSS layout
  viewport. When that viewport is wider than the editor, a separate visual
  fit scale shrinks the rendered frame without changing media-query or viewport
  unit evaluation. The Preview bar reports both the authored pixel width and
  the visual scale so these two concerns cannot be mistaken for each other.
- The Live Preview payload normalizes stored `snake_case` design rows and the
  global layout layer to the public Runtime placement contract before rendering,
  so unsaved previews and saved public pages use the same widget identity and
  percent-bound fields.
- Public widget-instance defaults use Runtime Manager's existing
  `cmsPublicRuntimeRequest` facade. Inside Live Preview, the adapter translates
  only validated `default.*` widget-instance reads to the Designer's existing
  authenticated `cmsAdminApiRequest` AppLoader bridge. The manifest does not
  expose direct PlainSpace events or add a public-token bridge exception.
- Closing the Live Preview removes the isolated frame from the editor DOM so
  stale public-runtime messages cannot keep the preview surface half-open.
- Live Preview forwards only the existing signed `originToken` to the public
  route. A valid, unexpired token allows that request to remove
  `X-Frame-Options`; invalid requests stay blocked and return
  `DESIGNER_LIVE_PREVIEW_ORIGIN_TOKEN_*`. The Designer app iframe itself stays
  sandboxed without `allow-same-origin`.
- The draft payload carries the already-loaded Color Scheme, Font Package and
  validated font catalog into the public frame. The preview applies those
  central defaults locally and does not mint a second token or make direct API
  calls from the sandbox's opaque origin.
- The frame reports `loading`, `ready` or `error` to agent feedback. A runtime
  that does not answer before the load deadline reports
  `DESIGNER_LIVE_PREVIEW_TIMEOUT`.
- Footer zoom remains an always-available editor view control. The Scroll
  timeline is a contextual motion-preview tool and appears only when the
  selected element has Sticky/Pinned behavior or an enabled effect; static
  selections do not reserve permanent footer space for it.
- Design saves capture the visible viewport region for thumbnails and cap the
  generated image dimensions, so small cards stay recognizable instead of
  shrinking a full-height 1:1 page capture.
- The publish panel stores the returned thumbnail URL on
  `page.meta.designThumbnail` when it creates or updates a page from a Design
  Studio publish flow.
- The header Publish button opens the right-side Publishing panel on all design
  layers. The panel combines first publication with a usage view: it lists
  public pages whose `meta.designId` or `meta.layoutTemplate` points at the
  current design, plus the current `plainSpace.publishedDesignMeta` bundle
  path. Publishing still keeps the compatible `layoutTemplate` reference and
  now also writes the saved `designId` and `designTitle` when `saveDesign`
  returns an id.
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
- The builder uses the shared CanvasGrid in percentage mode, but Design Studio
  editing mirrors the visible canvas width as 1px horizontal units instead of
  exposing a 12-column editing grid. `data-x`, `data-y`, `gs-w` and `gs-h` are
  edit-time pixel units; persisted geometry remains `xPercent`, `yPercent`,
  `wPercent` and `hPercent` so runtime rendering can stay responsive. Layout
  containers are structural nodes; regular widgets should not duplicate
  sections, rows or columns as widget types.
- Design Studio enables CanvasGrid object snap guides with a 6px tolerance.
  During drag, moving widgets show visible neighbor edge, center, canvas-edge
  canvas-center and equal-spacing guides while the live element stays under the
  pointer; the snapped target is committed when the pointer is released. The
  temporary guide lines, distance metadata and live-magnet mode are also exposed
  through the agent feedback `snapGuides` block.
- The editor `#layoutRoot` must not create a private stacking context, and
  editable builder grids keep overflow visible so selection outlines and resize
  handles remain visible at canvas edges. Viewport guides fade while a widget is
  selected or edited so they do not compete with handles and outlines.
- The editor `#builderViewport` owns the native scrollbars and keeps them on the
  fixed stage edge. Canvas centering belongs to `.canvas-zoom-sizer`, so
  changing canvas width or zoom does not move the scrollbar track with the
  canvas content.

## Sidebar panels
- The Design Studio sidebar uses one stable rail shell. Widget types own its
  full remaining height and render as one vertical icon list; only this list
  receives vertical overflow when space is tight. Layout and Scene behavior
  controls stay fixed below it in visually separate groups.
- Scroll and Action in the fixed behavior group are one-shot shortcuts. A
  second click clears the pressed rail state without rewriting the selected
  widget's saved behavior. They do not lock the Studio into a persistent tool
  mode.
- Clicking Text, Media, Shape, Button, Navigation or Content opens an anchored
  preset popover to the right of that widget type. Choosing a preset performs
  the existing insert action. Clicking the same widget type again, pressing
  Escape or clicking outside closes the popover without changing the canvas.
- Scenes are storyboard-style viewport states, not vertical document scroll
  sections or a primary sidebar chapter, and are edited from the canvas
  storyboard rail. Layers are the editable elements inside the active Scene.
  Empty Scenes keep their Scene name and quick-insert controls directly in the
  viewport; that empty-state surface lives outside the normalized LayoutTree
  so container hydration cannot remove it.
  Layers is a separate top-level tool in the fixed left rail beside Layout; it
  is not part of the selected widget's Content options. The right sidebar is
  reserved for the selected widget's Content, Behavior and Style properties.
  Selecting a row in the left Layers panel keeps that panel open, selects the
  matching canvas widget and scrolls the stage to it when it is outside the
  visible viewport. Layer rows also expose forward/backward order controls that
  update the saved widget `zIndex`.
- The raw public widget registry is not dumped into the default sidebar, so
  `textBox`, `mediaBlock`, `buttonLink`, `gallery`,
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
