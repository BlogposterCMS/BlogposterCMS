# Changelog
All notable changes to this project will be documented in this file.

El Psy Kongroo

## [Unreleased]

### Fixed
- Plainspace admin renderer and CanvasGrid now keep fractional column widths
  while caching values, preventing gaps and percentage drift after resize
  events.
- Rebuilt Plainspace admin bundles so cached column width logic ships to production dashboards.
- Plainspace admin canvas now caches column width recalculations and disables
  widget transitions outside edit mode so resize observers no longer trigger
  repeated reflows or unintended animations while viewing dashboards.
- Plainspace admin renderer now iterates every layout entry to render duplicate
  widget instances with their own metadata, keeping admin controls and layout
  persistence aligned with the saved configuration.
- PlainSpace admin workspace navigation now resolves icon assets against the
  current `ADMIN_BASE` prefix so nested admin deployments load default and UI
  icons reliably.
- Designer publish flow now skips uploading empty bundle stubs, updates the
  stored file list accordingly, and logs when optional assets are filtered so
  metadata stays aligned with what was actually published.
- Media Manager uploads now accept empty file payloads, decoding zero-length
  base64 data while continuing to enforce the existing extension whitelist.
- Plainspace grid push handling now prefers vertical adjacency before scanning
  horizontally or falling back to the global search, keeping displaced widgets
  in their original columns when gaps exist elsewhere on the canvas.
- Plainspace renderer now derives grid row counts from saved percentage heights
  and resolves collisions via a deterministic occupancy search so overlapping
  widgets keep their intended ordering, while preserving percent-based widget
  heights when canvas metrics are temporarily unavailable.
### Changed
- Restored PlainSpace admin workspace navigation fallback when visiting `/admin`
  without a trailing slash so workspace menus stay populated even when the URL
  omits the terminal separator.
- Normalized PlainSpace admin workspace navigation so repeated trailing slashes
  in `ADMIN_BASE` collapse to a single separator and active workspace detection
  remains stable when paths include duplicate leading slashes.
- PlainSpace admin seeding now groups widgets into width-driven rows and saves
  both percent-based and grid coordinates so freshly seeded dashboards render
  without client-side collision fixes.

### Added
- Added a jsdom regression test that covers the `/admin` fallback to guard
  against future workspace navigation regressions.
- Added a jsdom-backed regression test that hydrates overlapping Plainspace
  seeds to ensure widget coordinates remain unique and gap-free.
- Designer app now shows skeleton placeholders and inline error alerts while
  loading sidebar and panel partials so authors receive immediate feedback when
  partial requests succeed or fail.
- Added a back button to the site setup step so installers can quickly return to adjust admin credentials without losing their
  progress.

### Maintenance
- Optimized the admin canvas drag pipeline so the bounding-box manager schedules
  updates once per frame, restoring smooth pointer tracking when moving widgets.
- Cleared ESLint unused-variable warnings across builder and admin assets by
  trimming dead imports, renaming unused parameters, and adding targeted error
  logging where helpful.
- Migrated designer builder orchestration to TypeScript (`builderRenderer.ts`,
  header/publish renderers) and introduced a shared logger for structured
  diagnostics across builder subsystems.
- Regenerated the CMS `package-lock.json` so the new TypeScript dev dependency is captured for reproducible installs.
- Added a project-wide TypeScript configuration enforcing strict type-safety defaults (`strict`, `noUncheckedIndexedAccess`,
  `noImplicitOverride`) to guide all future `.ts` and `.tsx` development.
- Refactored the designer builder renderer into dedicated header, preview, layout, and
  history helpers so `builderRenderer` now orchestrates imports instead of embedding the
  full implementation.
- Align `babel-jest` and `jest-environment-jsdom` with the existing Jest 29 toolchain so runtime sanitization tests install and run without peer dependency conflicts.

### Security
- Startup now aborts when `APP_FRAME_ORIGIN_TOKEN_PRIVATE_KEY`/`APP_FRAME_ORIGIN_TOKEN_PUBLIC_KEY` are missing so deployments cannot silently rely on development key pairs when minting admin iframe tokens.
- Designer iframe now fetches the RSA origin-token public key from `/apps/designer/origin-public-key.json`, verifies signed origin tokens, and ignores parent windows that spoof the token or fail referrer/origin checks.
- Admin iframe loader now forwards the signed origin token to embedded apps, keeping legacy allowed-origin lists for compatibility while granting the designer a tamper-evident bootstrap channel.
- Installation API now trims usernames and emails before validation so leading whitespace can no longer bypass forbidden-name policies during first admin creation.
- Runtime page loader now requires explicit truthy trust flag literals (boolean `true`, numeric `1` or the strings `'true'`, `'1'`, `'yes'`, `'y'` or `'on'`) before executing custom design scripts, preventing stringified falsy values from bypassing the trust gate.
- Runtime page loader now sanitises design HTML before injection and only executes custom design scripts for entries flagged as trusted (for example `allowCustomJs`).

### Fixed
- Respected CanvasGrid DOM metrics when column or row counts are unbounded so
  percent-sized widgets expand to match the rendered grid instead of the
  default 12-unit fallback.
- Restored deterministic percent heights for widgets by basing vertical unit
  conversion on grid rows/columns instead of the requested percentage, and
  repaired browser module imports so widget options load correctly at runtime.
- Canvas grid percent sizing now resolves widths via configured columns and
  a deterministic vertical baseline, refreshing once metrics are available so
  seeded widgets keep their intended dimensions even when the canvas initially
  reports zero size.
- Installation flow now relies on a shared helper for lock-file and user checks, preventing login/install redirect loops when a
  stale `install.lock` remains without any seeded users.
- Admin home route now shares the admin shell bootstrap script so workspace
  navigation, sidebar data, and authenticated API calls initialize reliably on
  `/admin/home`.
- Designer builder header now renders reliably again thanks to sanitized
  partial loading with a resilient fallback shell, and all designer panels
  align to the live header height via CSS variables to prevent layout gaps.
- Builder bootstrap once again tracks the active global layout name, ensuring
  layout metadata stays available after ESLint cleanups.
- Admin iframe postMessage whitelist now rejects `null` origins and non-HTTP(S) protocols to block sandboxed pages from spoofing trusted hosts.
- Designer iframe now responds to the origin that delivers init tokens so multi-origin admin hosts receive readiness events reliably.
- Designer iframe communication now whitelists parent origins and ignores untrusted messages before processing tokens.
- Public renderer now converts designer percentages into pixel offsets using the saved canvas footprint so published layouts align pixel-for-pixel with the designer preview.
- Designer-rendered pages now honor saved widget layering, rotation, and opacity so public layouts match the designer preview.
- Admin dashboard placement mode now respects the canvas padding when calculating drag and drop positions, keeping the grid anchored on screen and ensuring widgets land exactly where they're dropped.
- Admin dashboard widgets no longer scale on hover in placement mode, keeping their grid size stable while arranging layouts.
- Layout mode now seeds a stable root container and serializes that node instead of the wrapper element, so splits, workarea
  flags, and design references persist reliably across reloads.
- Layout name input now retains unsaved text when switching layers by capturing the current value before the header reloads.
- Builder header reloads when entering layout mode so the back button reflects the correct origin.
- Header back button now validates the referrer and falls back to the dashboard to avoid redirecting users back to the login screen after authentication.
- Container action bar uses SVG icons instead of emojis for a consistent theme.
- Node ID generation now falls back to a timestamped random string to minimize collision risk.
- Runtime page loader now sends module-authenticated requests so layout and page data resolve correctly.
- Layout mode only disables pointer events on widget canvas items, leaving container controls clickable.
- Root-level builder grids now flex to fill `#layoutRoot`, ensuring `#workspaceMain` spans the full work area before any splits.
- Splitting a non-root container now transfers the `data-workarea` flag to the first new child so the active work area persists.
 - Root splits now add a `layout-container` class to `#workspaceMain`, remove its absolute positioning styles, and append a single empty sibling grid with `layout-container builder-grid canvas-grid` classes and a unique id.
 - `#workspaceMain` now flexes alongside new root layout containers, allowing siblings to share horizontal or vertical space.
 - Adding a container at the layout root now appends one builder grid with a unique id and honors the selected flex direction.
- Zoom sizer now derives height from the larger of the grid and viewport to prevent collapse during canvas zooming.
- Removed builder grid min-size constraints so `#workspaceMain` always mirrors its parent container without overflow.
- Viewport slider now resizes the builder viewport so the layout root and work area match the selected width.
- Restored canvas zoom sizer wrapper around `#layoutRoot` so viewport zoom functions correctly.
- Layout root carries builder grid styling so workspaces stay centered after splits.
- Content-only grid changes no longer flood layout history or trigger redundant autosaves.
- Default workarea selection skips split containers and the layout root, ensuring saved split layouts attach the grid to a leaf container.

### Changed
- Publish panel now surfaces validation, success, and error messaging inline with improved focus handling, replacing blocking alerts during design publishing.
- Removed temporary layout exit button to keep the layout editor distinct; use the back button to leave layout mode.
- Layout title defaults to "Layout name" when no previous name is provided.
- Removed the layout editor pill; saving now uses the header control and the publish action is hidden in layout mode.
- Footer no longer shows layout/design tabs; zoom controls remain shared across editors.
- Layout structure features enabled by default; set `FEATURE_LAYOUT_STRUCTURE=false` to disable.
- Page loader now recognises `workarea` flags as dynamic host indicators.
- Removed legacy split layout controls and gated layout structure UI behind `FEATURE_LAYOUT_STRUCTURE`; docs updated for the new layout/design flow.
- Refactored layout mode handling into a dedicated renderer module to keep `builderRenderer` modular.
- Root splits now spawn a single empty layout container beside `#workspaceMain`; further splits divide containers in two.
- Layout containers created in split mode now start with a single canvas-enabled builder grid instead of two nested child containers, enabling widget placement in both containers.
- Removed designer CSS output; SCSS is the source of truth for designer layout.
- `#workspaceMain` now lives inside `#layoutRoot`; splitting it creates a new sibling container rather than dividing the main workspace.
- `#layoutRoot` now lives inside the zoom viewport and overlays the `#workspaceMain` workarea; splitting a container spawns two child grids and assigns one as the new workarea.
- Builder viewport separates design (`#workspaceMain`) and layout (`#builderGrid`) grids so layout splits no longer wrap the design canvas.
- Change event payload includes current grid width for precise viewport marker placement.
- Content edits now emit grid change events so the viewport slider marks text or image updates per breakpoint.
- Builder opens designs in the Design layer by default and renames toolbar layers to "Layout" and "Design".
- Split layout control opens a builder panel instead of a popup for layout selection.

### Added
- Admin settings workspace now includes dedicated **Access Control** and **Audit Log** pages. The Access Control widget surfaces the `ALLOW_REGISTRATION` toggle while the Audit page exposes the activity log directly inside settings.
- Design sidebar includes a leading layout switch bubble to open the layout editor.
- Container action bar gains a design assignment control that stores a `designRef` on each container.
- Layout serialization now persists stable `nodeId`s, split sizes and design references for deterministic runtime mapping.
- Runtime page loader renders layouts, mounts static design refs and injects page designs into the dynamic host.
- Layout panel offers an arrange toggle for drag-and-drop container reordering with history and autosave.
- Layout panel now renders a clickable tree of layout containers that scrolls the canvas to the selected node.
- Layout mode now offers container action bars with add, host toggle and delete controls plus a placement picker for 50/50 container insertion.
- Designer now supports a basic layout mode that swaps the widget sidebar for a layout panel placeholder, disables widget interactions and shows a "Layout-Editor" pill with save and close actions.
- Public `grid.emitChange()` helper and `designerContentChanged` autosave event for responsive content updates.
- Dedicated `#workspaceMain` design grid renders alongside a persistent `#layoutRoot` containing a layout-only `#builderGrid` so layouts deserialize without detaching the canvas.
- Layout layer highlights the Primary Workarea for clearer widget placement.
- API endpoints to list layouts and fetch individual layouts via `designer.listLayouts` and `designer.getLayout`.
- New `getEnvelope` event and client-side orchestrator for loader-based public page rendering.

### Fixed
- Default workarea now falls back to the first layout container when sizes are unmeasurable, keeping the builder grid in the correct region on load.
- Splitting the primary workarea now moves existing children—including the builder grid—and transfers the workarea flag to a child container so editing continues in the correct region.
- The layout root inserts a fallback container and reattaches the grid on window resize to avoid detached canvases when designs provide an empty tree or the DOM shifts.
- App loader validates required backend events before launching apps and warns users when the designer module is unavailable.
- `designer.getLayout` now forwards the provided token to database calls, preventing unauthenticated layout requests from failing.
- Import missing layout placeholder handlers so the designer module loads without ReferenceErrors.
- Deserializing layouts now resets containers to prevent duplicate children after reload.
- Layout panel collapse button now closes the panel properly.
- Layout panel labels restored to reference the global layout, preserving the opt-out workflow per design.
- `designer.saveDesign` now forwards layout data and layout flags so layouts persist in `designer_layouts` and designs in `designer_designs`, enabling separate editing of templates and designs.
- Layout selection panel no longer references a nonexistent `global-panel` and starts split mode directly.
- Saving designs serializes the root layout container so top-level splits persist after reload.
- Ensure designer module always registers event listeners so `designer.saveDesign` and related calls no longer emit "No listeners" warnings.
- Designer preview capture now fetches allowed external font stylesheets to prevent cross-origin `cssRules` errors.
- Designer save requests report a clear timeout error after 20s instead of failing silently.
- Zoom control and viewport sliders now use the user-selected accent color instead of the default blue.
- Prevented double initialization of optional modules and added missing event callbacks to remove startup warnings.
- Prevented duplicate designer event listeners from triggering multiple responses and `ERR_HTTP_HEADERS_SENT` errors when saving or listing designs.
- Module loader source and log messages now fully in English for clearer maintenance.
- Designer module no longer requires core emitter utilities, allowing sandboxed loading.
- Module loader error notifications now display in English.
- Normalise `designer.getDesign` widget rows to camelCase so saved layouts
  render correctly in the builder.
- Designer bootstrap fetches existing design data by `designId` so opening a saved design no longer erases its layout.
- Lowercase and handle non-string inputs in `sanitizeSlug` to prevent `raw.trim`
  runtime errors when opening designs from the layout gallery.

### Added
- Regression test ensures designs update existing design by ID.
- Public page renderer can load attached designs via new `designer.getDesign` API.
- API endpoint `designer.listDesigns` to retrieve all saved designs.
- Database manager schema parser now supports a `float` column type for module tables.
- Optional widget option debugging to inspect grid measurements when seeding layouts.
- Documented seeding admin widget height options and CanvasGrid sizing behaviour.
- Initial setup color picker now previews the chosen accent colour live and uses builder-style presets.
- `saveDesign` now falls back to a shared `capturePreview` helper when no callback is provided, restoring automatic preview generation.
- Builder now keeps separate undo/redo history for each design in the page builder.
- Global transparency slider in text editor toolbar controlling opacity for all widgets.
- Text editor toolbar now includes a single button to cycle text alignment between left, center, right and justify.
- Publish panel now adds a title, leading-slash slug input with dropdown suggestions, draft/unpublish toggle, and placeholder Settings button.
- Builder now applies user-selected accent color within the builder via shared `userColor` module.
- Centralized save and autosave logic into a new `saveManager` module for reuse across the builder.
- Publishing now saves the current layout before creating or updating pages and attaching designs.
- CanvasGrid now accepts an `enableZoom` option; dashboard grids disable zoom by default to avoid the builder's zoom sizer.

 
### Fixed
- `designer.getLayout` now resolves saved layouts instead of returning an empty grid so published pages render their stored widgets.
- Public orchestrator resolves module loaders from `/modules/<source>/publicLoader.js` or `/mother/modules/<source>/publicLoader.js` and widget loader decodes registry `content` JSON for secure rendering.
  - Public HTML loader lazily imports sanitizer and executes inline scripts via Blob URLs instead of `eval` for safer rendering.
- Widget loader converts percentage-based layout coordinates to grid units so widgets render at their saved positions.
- Home page requests resolve the configured start page before requesting its envelope to avoid empty slug errors.
- HTML attachments now tag `source: "pagesManager"` so the client can resolve the correct loader.
- Ensured public envelope requests use a retrieved public token and corrected loader paths and widget registry parameters for secure rendering.
- Admin app route and widgets no longer coerce design IDs to integers,
  preserving non-numeric identifiers when launching the Designer.
- Page content and layout gallery widgets now launch the Designer with validated design IDs so edits update existing designs instead of creating new ones.
- Designer app accepts a dedicated `designId` query parameter instead of reusing `pageId`, decoupling designs from pages.
- Editing an existing design no longer creates duplicates; the builder now
  receives the design ID and version so saves update the original record.
- Designer app now shows the design's name in the browser title when editing an existing design.
- Import `handleGetDesign` placeholder in designer module to prevent initialization errors.
- Designer schema definition now uses plain integer `design_id` columns to avoid SQLite "more than one primary key" errors.
- Custom colour picker now spawns a fresh swatch when reopening the editor instead of overwriting the previous one.
- Custom colour picker now updates the current swatch live instead of creating a new circle for each hue adjustment.

### Removed
- Dropped weight-column migration placeholders (`CHECK_PAGES_TABLE`, `ADD_WEIGHT_COLUMN`); fresh installs already include the field.
- Removed stray debug logs from `tokenLoader` and `pageDataLoader` to avoid leaking sensitive information.
- Obsolete `uiEmitter` and dialog override scripts, restoring native browser dialogs and removing hanging confirmation Promises.
- Support for dynamic action buttons in the content header.
- Removed the right-side admin pages menu from the dashboard to streamline navigation.
- Sample designer `adminSeed.json` file.

### Changed
- Public loaders now reside in each module directory and expose a `registerLoaders` helper so headless clients can wire them up without Plainspace.
- Shared envelope orchestrator and loader registry moved to `/assets/js/envelope` for framework-agnostic use.
- Content gallery and page content widgets now load designs from the new designer module and allow attaching them.
- Initial setup color picker is now displayed inline beneath the project name for instant accent previews.
- Page list card now shows a house icon before the slug to set or indicate the home page, removing the slug edit icon and right-side home action.
- Updated page list card action icons to use pencil, brush, drafting-compass, external-link, share-2 and trash-2 for clarity, while preserving the option to set a page as the home page.
- Admin home workspace now seeds roadmap intro, upcoming features, and drag demo widgets, replacing previous defaults.
- Autosave toggle lives in a dropdown attached to the Save button for quicker access.
- Builder publish flow now offers a slug picker with draft warnings and optional auto-publish.
- Builder workspace now displays the current viewport width in the top-right corner.
- Color picker now tracks recent selections, lists document colours and accepts direct hex/RGB input.
- Publish panel now auto-creates pages for new slugs and shows a full URL preview beneath the slug field.
- Initial setup color picker presets are now circular with a subtle gray border for clarity.
- Publish panel suggestions now open in a popup similar to the builder options menu.
- Builder canvas zoom sizer now applies equal right spacing and doubles the top margin for balanced canvas layout.
- Publish panel suggestions now open in a popup similar to the builder options menu.
- Draft warning now hides when the draft checkbox is unchecked.
- Dashboard checkboxes adopt the new UI styling and the publish panel draft checkbox matches.
- Builder publish and builder panels now inherit global fonts, use side shadows instead of borders, and the publish button spans the panel width.
- Builder sidebar adopts the dashboard's bubble style for consistent navigation.
- Builder publish suggestions now only list pages from the public lane to avoid exposing admin pages.
- Extracted builder header button logic into a dedicated module for clearer separation of concerns.
- Moved viewport and menu buttons into the builder header partial for easier customization.
- Builder header Save and Publish buttons now match Preview styling and only show color when active.
- Publish panel now behaves like the builder panel and shifts `#content` aside instead of overlaying it.
- Extracted builder publish panel logic into a dedicated module for easier maintenance.
- Publish panel markup extracted into a standalone partial for easier maintenance.
- Simple hue wheel with hex input accessible from preset colors.
- Publish panel replaces “+ Add page” with “+ Create page,” immediately creating a public page and offering a “Set page to draft” option for any selected page.
- Builder and admin panels now use the variable body font for consistent typography.
- Header viewport control with slider to adjust builder canvas width.
- Login screen now cycles through preset accent colors for its dotted background and form border.
- Updated CanvasGrid documentation to cover responsive builder configuration.
- `CanvasGrid.update` accepts an optional `{ silent: true }` flag to suppress `change` events during internal recalculations.
- `PixelGrid.update` accepts an optional `{ silent: true }` flag to avoid spamming `change` events during live interactions.
- Designer app uses standalone `PixelGrid` built on grid-core modules.
- Moved `globalEvents` helper into grid-core for shared consumption.
- Extracted builder panel into dedicated module and HTML partial for cleaner builder initialization.
- Builder panels now appear inline between the sidebar and canvas instead of overlaying content.
- Builder publish slug suggestions now list only existing pages and show a draft option when creating new ones.
- Publish button now toggles the publish panel and the panel includes a close button for easy dismissal.
- Builder layout wraps the viewport in a `<main>` element, nests the footer inside `#content`, and places the publish popup in a right-side `<aside>` without a backdrop.
- Initial `grid-core` module with geometry helpers, bounding box manager and lightweight event emitter for upcoming grid refactor.
- Optional `liveSnapResize` flag to enable per-frame snapping during resizes.
- CanvasGrid exposes an optional `liveSnap` flag to enable per-frame snapping during drags.
- Dashboard now injects its own remove and resize controls and tracks drag state via CanvasGrid events, revealing buttons only when selected or dragging.
- Admin endpoints to install or uninstall apps while updating the registry.
- Confirm password field in setup and environment-driven allowance for weak dev credentials with optional auto-login; top-left branding now uses the SVG logo.
- First-run install wizard with multi-step flow, custom color picker and install lock.
- Installer enforces strong passwords and blocks common usernames.
- Optional development auto-login for localhost via `DEV_AUTOLOGIN`; weak credentials require `ALLOW_WEAK_CREDS` and are blocked in production. A red "Development mode" banner now appears on all pages when not in production.
- Added database-backed `weight` field to pages to control header and sidebar menu ordering.
- Slack notifications via incoming webhook using only core `https` module; integrations can now expose field metadata for the admin UI.
- Introduced `pageService` to centralize page data access through the event bus.
- Elements with `title`, `aria-label`, or `data-label` now display sidebar-style floating labels on hover for consistent tooltips.
- Global dialog overrides funnel alert/confirm/prompt through UI events for custom popups.
- Client-side `uiEmitter` stub and preview handlers ensure dialog hooks are available before other scripts.
- Dialog overrides keep `confirm`/`prompt` synchronous, emit preview events through `uiEmitter`, and expose a new `bpDialog` async helper for custom popups.
- Header action bar now includes inline widgets toggle and delete buttons; widgets panel can use existing external toggles.
- Icon button in subpage floating field now opens a lazily loaded grid of icons from `/assets/icons` and replaces the default icon upon selection.
- Inline workspace and subpage fields now slide out with a left-side icon picker, centered name input, and right confirmation button.
- Header and sidebar "+" buttons reveal inline fields for creating workspaces and subpages.
- Widgets panel now supports dragging widgets onto the dashboard grid.
- Sanitizer now exposes `parentSlug` in `pageDataLoader` so widgets can access hierarchical data.
- Page retrieval queries now join parent pages and expose `parentSlug` in results.
- Admin page seeding validates icon paths from `/assets/icons` and exposes them for dynamic navigation.
- Root admin pages explicitly define their `workspace` slug; subpages no longer carry or inherit a workspace.
- Dynamic workspace navigation populates header and sidebar links based on admin pages and includes creation shortcuts.
- Introduced dynamic breadcrumbs in the admin content header and removed page titles from the main header.
- Converted left-side menus to a bubble layout and made active icons glow in the user's color.
- Introduced `modules/designer` to handle database operations for the standalone Designer app.
- Documentation now covers declaring `apiEvents` in widget metadata for secure
  endpoint pre-registration.
- Default widgets declare their API event usage in metadata, enabling secure pre-registration of endpoints.
- Widgets now register required API events from metadata so the client can declare needed endpoints before widget code loads.
- `/p/{slug}` route rewrites to builder HTML files without exposing library paths.
- `makeFilePublic` now preserves subdirectories and infers user IDs from JWTs for safer publishing.
- Uploaded HTML in Page Content widget is stored in a dedicated media folder and remains available as a design.
- Builder sidebar now uses a semantic `<aside>` element for improved accessibility.
- Layout bar now resides within the builder footer for clearer structure.
- Sanitizer now preserves `<style>` tags and strips unsafe CSS so public pages display full designs.
- Publish popup now opens as a right-side panel instead of a bottom bar.
- Builder publish slug picker now uses the shared `pageService` for page creation and updates, matching page editor logic.
- Builder grid now starts at 100% zoom, centers within the viewport, and exposes horizontal scrolling for wide layouts.
- Builder viewport slider now defaults to 1920px and supports widths up to 3840px for large-screen previews.
- Color picker hue editor now uses a square selector with hue and transparency sliders and a close icon.
- Color picker limits document colours to the builder grid, preselects the widget's current colour and opens its hue editor beneath the chosen swatch.
- Replaced `csurf` with lightweight `csrf` middleware to reduce dependencies.
- Default builder widget width increased to four columns for better initial sizing.
- Builder grid column width recalculation is debounced via `requestAnimationFrame` and widget layouts persist percentage-based coordinates.
- Color picker panel integrates the picker without a close button and fills the panel.
- Builder header buttons now use borderless styling to match the Plainspace dashboard.
- Publish popup now opens as a right-side panel instead of a bottom bar.
- Builder publish slug picker now uses the shared `pageService` for page creation and updates, matching page editor logic.
- Builder grid now starts at 100% zoom, centers within the viewport, and exposes horizontal scrolling for wide layouts.
- Builder viewport slider now defaults to 1920px and supports widths up to 3840px for large-screen previews.
- Color picker hue editor now uses a square selector with hue and transparency sliders and a close icon.
- Color picker limits document colours to the builder grid, preselects the widget's current colour and opens its hue editor beneath the chosen swatch.
- Replaced `csurf` with lightweight `csrf` middleware to reduce dependencies.
- Default builder widget width increased to four columns for better initial sizing.
- Builder grid column width recalculation is debounced via `requestAnimationFrame` and widget layouts persist percentage-based coordinates.
- Color picker panel integrates the picker without a close button and fills the panel.
- Builder grid now uses responsive CanvasGrid with 12 columns, percentage-based sizing and dynamic column widths.
- Builder grid disables push-on-overlap, live snapping and percentage mode for
  pixel-perfect placement without moving neighbouring widgets.
- Builder modules relocated into the standalone designer app, removing dashboard references and loading the designer via AppLoader.
- Designer app uses shared sanitizer module instead of editor dependency.
- Designer app stylesheet split into component-specific SCSS files for easier maintenance.
- Bounding box resizing now uses the frame itself instead of separate handles.
- CanvasGrid drags now move smoothly without snapping until release.
- Drag and resize interactions now rely on Pointer Events with capture for consistent cross-device input.
- Admin widget container styles now also apply to canvas items to prevent shadow DOM overrides.
- Hover effects and drag handles for admin widgets now only appear in dashboard edit mode.
- App registry tracks build status and index availability; app route refuses unbuilt apps and forwards iframe events via `dispatchAppEvent`.
- App launcher now loads apps inside an isolated iframe and passes CSRF and admin tokens via the parent window to keep APIs working without leaking dashboard styles.
- Header "Create workspace" button now displays only an icon for a cleaner navigation header.
- Primary buttons now follow the user's accent color in the dashboard and fall back to neutral form tones on the install route.
- Primary buttons on install screens now have a wider footprint and clearer disabled styling.
- Refined button styles with higher disabled contrast, block and group utilities, reduced-motion support and dark-mode ghost borders.
- Expanded button system with standardized variants, sizes, icon spacing and loading state while keeping the login screen's custom styling.
- Rewrote global button styles with gradient primary and ghost secondary variants while preserving the login screen's custom button.
- Dashboard grid columns now auto-resize to fill the container, eliminating dead space on wide viewports.
 - Designer module provisions its own schema via `createDatabase`/`applySchemaDefinition` and switches to high-level CRUD events to prevent automatic deactivation on constraint errors.
- HTML uploads now go through the media manager to stay in the library and avoid overwriting existing files.
- Documented new `appLoader` core module that securely builds the app registry from manifests.
- Mongo pages placeholders now drop slug indexes by name, store timestamps as `Date`, filter lane queries by language, and sitemap generation sorts by recent updates.
- Removed slug-only unique index in relational databases, backfilled page weights, and added composite indexes for faster page sorting.
- Notification emitter now uses a safe wrapper with console fallback across core loaders; appLoader emits warning notifications for missing or invalid manifests; default admin page widget spacing prevents layout overlaps.
- Module loader wraps module initialization in try/catch, emits system notifications on failure, and skips success logs when a module is deactivated. Widget seeding and app registry updates now report errors through the notification system.
- Dashboard scripts now import `bpDialog` from `/assets/js` to avoid relative path breakage.
- Workspace create button now hides existing workspace links and opens a floating field with matching minus icon.
- Login page background now uses the same dotted grid as the dashboard workspace.
- Page list inline editing now debounces input, handles Enter/Escape keys, and normalizes slugs to remove duplicate slashes and leading or trailing dashes.
- Page status toggles apply changes immediately with rollback on failure, and setting a start page refreshes the list to update the home badge.
- Moved `pageService` into the `pageList` widget folder for better encapsulation.
- Page list widget now separates data fetching, rendering, filtering, and inline editing while using dialog-based prompts.
- Admin content header deletion uses async `bpDialog.confirm` instead of native `confirm`.
- Save button in content header now highlights green on hover; delete icon turns red using SVG fill.
- Edit toggle button now uses icon-btn styling and no longer spins on activation.
- Icon picker grid widened to 360px for easier selection.
- Reordered content header actions: delete page button now sits left of breadcrumbs, save and add widget buttons swapped sides, and icons updated.
- Buttons no longer use box shadows for a cleaner look.
- Revamped public login screen with card-focused layout, dotted grid background, brand-accented inputs, and inline error display.
- Subpage add button now switches to a minus and hides its label while the floating field is open, and the field gains a card-style shadow.
- Subpage creation field renamed to `subpage-floating-field` and now floats next to its trigger button with a z-index of 1000.
- Inline create field now slides out beside trigger buttons, overlays surrounding content, and positions relative to the trigger button for correct placement.
- Create button in subpage floating field now uses a corner-down-right icon instead of text.
- Edit toggle now uses a square-pen icon and switches to a save icon while editing.
- Restyled widgets drawer to align with the overall admin UI.
- Slug normalization now preserves slash-separated segments, and both seeding
  and admin navigation operate on full path slugs.
- Breadcrumb now aligns to the left in the content header.
- Workspace navigation no longer infers workspaces from slugs; only pages with an explicit `workspace` matching their slug appear in the header.
- Replaced widget popup overlay with a collapsible widgets panel featuring
  category filtering and search.
- Refined dashboard layout with a translucent top bar, a tinted workspace gap, and a responsive sidebar that highlights the active page.
- Streamlined dashboard navigation with a glass top bar, rail-style sidebar,
  arrowed breadcrumbs, animated accent tabs, and a sticky header shadow.
- Admin dashboard widgets can now be repositioned via the drag handle even when not in edit mode.
- Refined dashboard header and navigation: tighter top spacing, larger touch targets, subtler hover tint with automatic text/icon contrast, and aligned breadcrumbs.
- Normalized user accent colors with HSL clamping and unified gradient logic for consistent theming.
- Decoupled the top header from accent tinting and mirrored the accent color on module and user tabs.
- Added dark mode variable defaults so accents appear softer on dark backgrounds.
- Page Content editor upload button now shows a dropdown with builder apps or direct HTML upload.

### Fixed
- Builder publish panel now loads full page data before updating to preserve metadata and correct draft status.
- Seeded admin widgets without layout options no longer overwrite saved heights on startup.
- Seeded admin widgets now default to a base height to prevent initial overlap.
- Editor toolbar tooltips no longer hide beneath other interface elements.
- User color module skips token validation when no admin token is present, preventing 500 errors during builder initialization.
- Designer app now displays the correct layout name when opening an existing template instead of falling back to "default".
- Publishing a design no longer fails with a missing `capturePreview` function and now offers to open the published page after publishing.
- Guarded global opacity default when localStorage is unavailable to avoid ReferenceError outside browsers.
- Builder initialization no longer fails when the preview button is absent, allowing the publish panel to open.
- Remaining German builder strings translated to English.
- Text widget icon in the builder sidebar now opens its panel via delegated clicks.
- Publish panel no longer extends below the viewport in the designer.
- Restored publish panel styling in the designer to match the overall Canva-inspired look.
- Hide autosave dropdown until toggled so the save menu stays hidden and positioned.
- Builder header buttons now use matching selectors so their styling applies correctly.
- Zoom sizer now expands to the grid width when the canvas exceeds the viewport, keeping the builder grid within its parent.
- Preserve scroll position by only recentering canvas on width changes near the origin.
- Restored styles for admin page stats widget and page picker lost during Sass refactor.
- Replaced deprecated Sass @import directives with @use and mixins to remove compilation warnings.
- Builder grid no longer drifts at low zoom; CanvasGrid now recenters on resize and uses a top-left transform origin.
- CSS sanitizer blocks non-http(s) `url()` protocols (like `data:`) to prevent style-based XSS.
- `applyWidgetOptions` now applies numeric `max`, `maxWidth`, and `maxHeight` percentages when seeding widgets.
- CanvasGrid keeps the builder grid within its parent during zoom so the canvas stays centered and doesn't drift sideways.
- Dashboard page renderer now sets `enableZoom: false` when initializing CanvasGrid to avoid creating an unnecessary zoom sizer.
- Dashboard widget selection no longer shifts items vertically by disabling the highlighting pseudo-element.
- CSS sanitizer blocks non-http(s) `url()` protocols (like `data:`) to prevent style-based XSS.
- `applyWidgetOptions` now applies numeric `max`, `maxWidth`, and `maxHeight` percentages when seeding widgets.
- Dashboard widget highlight no longer alters element dimensions, preventing ResizeObserver from miscalculating grid cell sizes.
- pageRenderer now derives finite grid dimensions before translating stored percentage coordinates so widgets render at their saved locations.
- Builder now forwards the current layout template to the designer and saves the chosen layout name when publishing new pages.
- Guarded zoom sizer resize observer to prevent runaway width expansion on zoom.
- Zoom sizer now updates on container resize and grid overflow allows scrollbars, keeping the canvas and grid aligned.
- Removed inline `min-width`/`min-height` from dashboard widgets to prevent
  unintended resizing jumps when layouts change.
- `makeFilePublic` now handles Windows path separators, allowing legitimate `builder/` paths on Windows.
- Builder publish now normalizes asset paths under `builder/` before moving files public, keeping slugs clean and restricting file locations.
- `makeFilePublic` now accepts user IDs from multiple JWT fields and builder emits the user ID, preventing missing-user errors during publish.
- Publish popup styles now load in the designer and backdrop aligns below the header.
- Publish popup now anchors beneath the Publish button instead of appearing at the edge of the screen.
- Builder slug picker now normalizes page responses to avoid draft warning crashes when selecting existing pages.
- Canvas wrapper now refreshes its height when grid rows are added after zooming so newly added content remains scrollable.
- Canvas wrapper now expands with zoom and viewport width so wide layouts remain horizontally scrollable at 100% zoom.
- Prevent HTML editor crash when `codeMap` is undefined by guarding widget code access.
- Color picker converts non-hex initial colours to hex before applying HSV state, preventing NaN previews.
- User color now applies correctly on the Home workspace and updates after header load.
- Home and Settings workspaces are protected from deletion in UI and backend.
- Creating new pages within the Settings workspace is now supported via the UI.
- Designer text widget loads editor bundle from build output and falls back to default export to avoid missing module errors.
- Widget options menu ignores buttons without registered handlers, preventing random `data-action` keys from causing crashes.
- Text widget now loads editor module without destructuring, preventing `registerElement` errors in builder mode.
- Unified text and background color pickers into a single instance, removing duplicate close buttons.
- Background toolbar now appears when no widget is selected, matching text-toolbar behaviour.
- CanvasGrid zoom now anchors to its center, keeping the grid positioned while scaling.
- Text widget no longer sets `contenteditable` by default, allowing toolbar actions to apply to entire widget when only selected.
- Bounding box is hidden during drags and grid commits deferred to drag end for smoother interactions.
- Restored `setDisabled` method on grid-core `BoundingBoxManager` for builder compatibility.
- Pixel-grid bounding box size now derives from DOM geometry, fixing offsets with rotated or padded widgets.
- Pixel-grid bounding box now matches widget dimensions exactly and stays in sync through live snapping.
- Restored generated builder stylesheet and removed manual CSS edits that would be overwritten on rebuild.
- Designer now bundles grid-mode styles locally instead of loading global `site.css`, keeping builder UI isolated.
- Bounding box handles restore resize functionality by enabling pointer events and binding resize listeners.
- Publish popup now anchors beneath the Publish button instead of appearing at the edge of the screen.
- Builder slug picker now normalizes page responses to avoid draft warning crashes when selecting existing pages.
- Canvas wrapper now refreshes its height when grid rows are added after zooming so newly added content remains scrollable.
- Canvas wrapper now expands with zoom and viewport width so wide layouts remain horizontally scrollable at 100% zoom.
- Prevent HTML editor crash when `codeMap` is undefined by guarding widget code access.
- Color picker converts non-hex initial colours to hex before applying HSV state, preventing NaN previews.
- User color now applies correctly on the Home workspace and updates after header load.
- Home and Settings workspaces are protected from deletion in UI and backend.
- Creating new pages within the Settings workspace is now supported via the UI.
- Designer text widget loads editor bundle from build output and falls back to default export to avoid missing module errors.
- Widget options menu ignores buttons without registered handlers, preventing random `data-action` keys from causing crashes.
- Text widget now loads editor module without destructuring, preventing `registerElement` errors in builder mode.
- Unified text and background color pickers into a single instance, removing duplicate close buttons.
- Background toolbar now appears when no widget is selected, matching text-toolbar behaviour.
- CanvasGrid zoom now anchors to its center, keeping the grid positioned while scaling.
- Text widget no longer sets `contenteditable` by default, allowing toolbar actions to apply to entire widget when only selected.
- Bounding box is hidden during drags and grid commits deferred to drag end for smoother interactions.
- Restored `setDisabled` method on grid-core `BoundingBoxManager` for builder compatibility.
- Pixel-grid bounding box size now derives from DOM geometry, fixing offsets with rotated or padded widgets.
- Pixel-grid bounding box now matches widget dimensions exactly and stays in sync through live snapping.
- Restored generated builder stylesheet and removed manual CSS edits that would be overwritten on rebuild.
- Designer now bundles grid-mode styles locally instead of loading global `site.css`, keeping builder UI isolated.
- Bounding box handles restore resize functionality by enabling pointer events and binding resize listeners.
- Builder grid recenters within the viewport after zoom changes, keeping the workspace aligned.
- Publish popup styles now load in the designer and backdrop aligns below the header.
- Publish popup now anchors beneath the Publish button instead of appearing at the edge of the screen.
- Builder slug picker now normalizes page responses to avoid draft warning crashes when selecting existing pages.
- Canvas wrapper now refreshes its height when grid rows are added after zooming so newly added content remains scrollable.
- Canvas wrapper now expands with zoom and viewport width so wide layouts remain horizontally scrollable at 100% zoom.
- Prevent HTML editor crash when `codeMap` is undefined by guarding widget code access.
- Color picker converts non-hex initial colours to hex before applying HSV state, preventing NaN previews.
- User color now applies correctly on the Home workspace and updates after header load.
- Home and Settings workspaces are protected from deletion in UI and backend.
- Creating new pages within the Settings workspace is now supported via the UI.
- Designer text widget loads editor bundle from build output and falls back to default export to avoid missing module errors.
- Widget options menu ignores buttons without registered handlers, preventing random `data-action` keys from causing crashes.
- Text widget now loads editor module without destructuring, preventing `registerElement` errors in builder mode.
- Unified text and background color pickers into a single instance, removing duplicate close buttons.
- Background toolbar now appears when no widget is selected, matching text-toolbar behaviour.
- CanvasGrid zoom now anchors to its center, keeping the grid positioned while scaling.
- Text widget no longer sets `contenteditable` by default, allowing toolbar actions to apply to entire widget when only selected.
- Bounding box is hidden during drags and grid commits deferred to drag end for smoother interactions.
- Restored `setDisabled` method on grid-core `BoundingBoxManager` for builder compatibility.
- Pixel-grid bounding box size now derives from DOM geometry, fixing offsets with rotated or padded widgets.
- Pixel-grid bounding box now matches widget dimensions exactly and stays in sync through live snapping.
- Restored generated builder stylesheet and removed manual CSS edits that would be overwritten on rebuild.
- Designer now bundles grid-mode styles locally instead of loading global `site.css`, keeping builder UI isolated.
- Bounding box handles restore resize functionality by enabling pointer events and binding resize listeners.
- Bounding box in pixel-grid builder computes position from widget dataset
  coordinates so rotated or narrow elements stay aligned.
- Restored shared grid modules (`canvasGrid`, `BoundingBoxManager`, `grid-utils`, `globalEvents`) to `plainspace/main` so the designer app no longer contains framework code.
- CanvasGrid pointer handlers now verify `currentTarget` and resize handles before releasing pointer capture to avoid null errors.
- Resizing widgets no longer jumps them to the origin on release by cleaning temporary styles before snapping.
- Bounding box is consistently rendered above widgets and widget content is disabled in edit mode, keeping resize handles usable.
- Bounding box now uses transparent edge overlays, keeping widget buttons and native resize handles clickable.
- CanvasGrid now resets cursors and clears temporary resize styles after snapping; resize previews bundle pointer moves with `requestAnimationFrame` for smoother feedback.
- CanvasGrid resizing no longer snaps to the grid while dragging, providing smooth pixel-based previews before snapping on release.
- Designer app imports Plainspace modules via `/plainspace` to avoid `coming-soon` placeholders when loading builder scripts.
- Hover cursor updates are throttled with `requestAnimationFrame`, resize edges widen on touch devices and disabled bounding boxes no longer intercept clicks.
- Bounding box frame now provides edge cursors, scales its hit area with zoom and starts widget drags without synthetic pointer events; designer retains its classic handles.
- Reverted accidental designer stylesheet edits; bounding box handles remain in the standalone designer.
- Bounding box updates now run in the next animation frame so the selection box stays aligned during drags.
- Drag handle styles correctly target `.canvas-item:before` to ensure grip visibility.
- Drag handlers now sync transformations and bounding box updates via `requestAnimationFrame` to prevent jitter when moving widgets.
- Bounding box positions now account for canvas scroll and zoom via `localRect`, retaining the `will-change` hint for stable rendering.
- Bounding box updates now round to device pixels and throttle via `requestAnimationFrame` for smoother interactions.
- Widget dragging now disables transitions, shadows and filters while the canvas grid uses CSS containment to isolate layout work.
- Column width calculations round to whole pixels to prevent subpixel snapping jitter.
- Designer app now receives CSRF and admin tokens via `postMessage`, removing inline scripts that violated CSP.
- Restore missing resize and delete controls for dashboard widgets and ensure drag or selection styling overrides hover effects.
- Removed inline scripts from admin app loader to enforce Content Security Policy compliance.
- Widget action chrome and drag shadows now activate only in dashboard edit mode, keeping controls hidden during regular viewing.- App loader now requests module tokens with a valid JWT instead of using `skipJWT`, preventing unauthorized token issuance.
- Workspace flyout creates a top-level page and collapses the icon picker upon submission.
- "Create workspace" header button is built programmatically as a semantic `<button>` and always wires its click handler even when the template omits it.
- Start setup and Continue buttons on the install wizard now use the primary style for better visibility.
- Install screen no longer inherits login page button styles.
- Install wizard indicators drop default list markers and active step forms stack vertically for clearer progress.
- Global form styles exclude step forms and install wizard steps hide by default with explicit active-state displays.
- Inject development auto-login only when the configured dev user exists, keeping auth strict and preventing redirect loops.
- Install wizard now hides inactive steps and applies consistent flex buttons after rebuilding assets.
- Updated dummyModule table creation SQL for SQLite compatibility, preventing syntax errors on startup.
- Replaced raw SQL in user role permission fixes with parameterized `dbUpdate` calls and routed page table migrations through a dedicated placeholder for cross-database compatibility.
- Added `INIT_APP_REGISTRY_TABLE` placeholder and MongoDB/PostgreSQL handlers so the app registry schema boots on all databases.
- Restored appLoader placeholders across SQLite, PostgreSQL and MongoDB, preventing placeholder strings from running as raw SQL.
- appLoader now creates its registry table via `performDbOperation` with SQLite-friendly SQL, preventing "near 'INIT_APP_REGISTRY_TABLE'" errors.
- pagesManager ensures the `weight` column exists before index creation, preventing "no such column: weight" failures during upgrades.
- appLoader uses SQLite-friendly schema and placeholders, resolving `unrecognized token ':'` database errors.
- plainSpace seeding now defines the slug reference before try/catch and skips when pagesManager is inactive, preventing runtime reference errors and noisy warnings.
- Module loader listens for `targetModuleName` deactivation events to avoid logging successful loads for modules that were actually disabled.
- Notification manager now verifies integrations before initializing; FileLog creates missing log directories and Slack webhook calls enforce `hooks.slack.com` with a five-second timeout.
- Module loader no longer logs a success message for modules that deactivate during loading.
- Module loader now notifies and deactivates community modules missing `index.js` so they never appear as loadable.
- Apps can expose a builder by adding a `builder` tag in their manifest.
- Builder publish now saves designs under `/builder/{designName}/` and records file metadata for safe overwrites.
- Publishing a design triggers a database save of the layout template.
- Published designs now include a full HTML skeleton and link their theme and widget assets.
- Builder can publish static HTML files to the media library via a new "Publish" button.
- Media manager now accepts HTML, CSS, and JavaScript uploads for static delivery.
- Introduced `/admin/app/:appName` namespace with a standalone Page Builder app.
- Seeded `builder.use` permission for controlling Page Builder access.
- App registry now builds at startup via a dedicated `appLoader` core module scanning `apps/` manifests.
- Webpack auto-maps app entry points based on each app's `app.json` manifest.
- Main content and content area now use the active user's color with light gradients.
- Sidebar menu icons are now flat, with an aero-glass bubble highlighting the active page in a light shade of the user's color.
- Admin dashboard widgets now feature a glass-style look with drag handles and subtle hover animations.
- Builder styles moved to `apps/designer/style.css` and removed from global `site.css` bundle.
- Dashboard widgets and actions now resolve builder apps dynamically, removing hardcoded `/designer` paths so core features remain functional if the app is removed.
- Core no longer hardcodes the Designer path; appLoader now serves the app dynamically so it can be removed cleanly.
- Renamed `apps/plainspace` to `apps/designer` and updated routes to decouple it from `public/plainspace`.
- Migrated essential Plainspace modules to `public/plainspace`, allowing the `apps/plainspace` package to be removed without impacting the dashboard.
- Top header now displays the official BlogposterCMS logo.
- Widget Manager scans `widgets/` and serves widget scripts from `/widgets/<dir>/widget.js`.
- Builder now uses a dedicated PixelGrid instead of CanvasGrid for layout editing.
- Dashboard continues to use CanvasGrid, keeping PixelGrid exclusive to the builder.
- Admin resize handle now uses the `move-diagonal-2.svg` icon.
- Replaced legacy Feather icon references with new icon set paths.
- CanvasGrid supports internal resize handles when bounding boxes are disabled, and the admin grid uses a 12×80px layout for stable percentage sizing.
- Dashboard editing no longer displays bounding boxes; resizing uses a bottom-right handle.
- Static builder route `/p/{slug}` checks the Pages database first, letting dynamic pages win on slug collisions.
- Builder publication moves entire folders in one operation and requires the `builder.publish` permission.
- Generated builder pages include a canonical link to `/p/{slug}` to mitigate duplicate content.
- Builder and renderer now operate on a pixel-based grid for precise widget placement.
- Page Content widget now displays available designs as preview cards and shows attached content separately.
- Builder now imports CanvasGrid and related utilities from public plainspace modules, removing duplicate builder copies.
- CanvasGrid now uses a 1px base unit for pixel-perfect alignment.
- Widget containers now share `page-list-card` styling for consistent appearance.
- Removed "editing for page" label and page selection dropdown from the builder header.
- Admin app launcher now resolves manifest entries to bundled scripts and exposes `/build` assets.
- Public renderer now lazy-loads builder modules to avoid bundling the entire builder into public pages.
- Builder assets are now served from `/apps/plainspace`, and the `/plainspace` alias maps to this location for backward compatibility.
- Shared widgets now highlight in gold on hover, falling back to black when the user color is similar.
- Layouts now store a `layer` value and widgets inherit the active layer.
- Widgets retain a `data-global` flag for shared widgets while per-widget layer values were dropped, and inactive layers share a unified appearance.
- Static builder route `/p/{slug}` checks the Pages database first, letting dynamic pages win on slug collisions.
- Builder publication moves entire folders in one operation and requires the `builder.publish` permission.
- Generated builder pages include a canonical link to `/p/{slug}` to mitigate duplicate content.
- Corrected HTML escaping in the Page List admin widget to restore widget loading and prevent XSS issues.
- Resolved broken import path for dashboard dialog helper and silenced dynamic import warnings during build.
- Confirm dialogs no longer stall when no handler resolves the UI event.
- Community modules now accept loader-issued JWTs and sign their event payloads; dummyModule and docs updated accordingly.
- Password visibility toggle now always stays within the login input field.
- Corrected `UIEmitter` logging strings to avoid runtime syntax errors.
- Icon picker panel now closes on outside clicks and no longer obscures its trigger button.
- Icon picker grid now closes after selecting an icon or re-clicking the trigger icon.
- Clicking the inline widget toggle no longer closes the panel immediately when the icon is clicked, ensuring the widgets panel slides in as expected.
- Admin page deletion now trims ADMIN_BASE without regex, handling special characters safely.
- Removed unused widgets-panel import from content header.
- Quick action buttons now display correctly in edit mode via CSS instead of inline styles.
- Widgets panel removes its floater when an external toggle is added later to avoid duplicate toggles.
- Subpage form submission now creates an admin subpage for the active workspace.
- Workspace and subpage panels now gain slide-in styling and no longer display titles.
- Slug sanitization now preserves slash-separated segments, fixing admin routes for nested pages.
- Workspace navigation initializes after the sidebar renders via a new `sidebar-loaded` event.
- Sidebar subpage navigation prioritizes `parentSlug` and falls back to slug prefixes for legacy entries.
- Sidebar subpage navigation now infers hierarchy from page slugs when `parentSlug` is absent.
- Admin seeder now uses `/` in `parentSlug` for nested pages so workspace navigation can recognize them.
- Sidebar navigation now resolves subpages via `parentSlug`/`slug` and displays icons from `meta.icon` or `config.icon`.
- Corrected user edit widget color picker path to prevent import errors.
- Top header user icon now links directly to the active user's profile.
- Resolved module resolution errors in the Designer app by switching to relative plainspace and asset imports.
- Widget code imports now wait for API event registration in builder, admin, and public lanes, preventing race conditions on first API calls.
- Page picker grid spans the full width with sensible column settings, preventing widgets from snapping back.
- Widget container shadows now apply only in the admin interface.
- Replaced invalid icon references in admin menus and widgets with available icons.
- Dashboard grid now keeps push-on-overlap enabled in static mode to avoid widget collisions.
- appLoader now exports `initialize()` like other core modules, preventing server startup crashes.
- Dynamic widget imports in the builder now bypass Webpack bundling, preventing missing module errors.
- Standalone builder app now links `site.css` and skips missing theme CSS gracefully.
- Added default theme assets to restore builder styling.
- Missing global helpers caused runtime errors in the admin panel; scripts now load from `/build` and the `resize` icon asset is restored.
- Builder app now loads required core scripts, restoring `fetchWithTimeout`, `meltdownEmit`, and icon rendering.
- Builder dashboard partials now load from `/plainspace/partials/` with sanitized file names.
- Served `public/plainspace` alongside app assets so dashboard scripts load without 404 errors.
- Restored `/plainspace` static route and corrected builder imports, resolving blank dashboards and MIME type errors.
- Maintenance mode now allows theme and plainspace assets, preventing MIME type errors on `/coming-soon`.
- Reserved `admin`, `app`, and `api` slugs to protect critical namespaces.
- Enforced a unique index on page slugs in database placeholders to prevent duplicate or reserved slugs slipping through.
- Raw SQL deletes now extract parameters from the `where` clause when `data` is omitted, preventing layout deletion errors.
- Text editor color picker and size dropdown now apply styles only to the selected text.
- Widgets from inactive layers ignore pointer events and editing, preventing accidental changes.
- Admin grid resize handles no longer slide underneath widgets when reaching the minimum size.
- CanvasGrid resize handle now styles correctly within widget shadow roots via adoptedStyleSheets, ensuring consistent positioning.

## [0.6.3] – 2025-08-01

### Changed
- Admin widgets now include a built-in resize handle and no longer rely on the
  BoundingBoxManager.
- Text editor toolbar now aligns with the left edge of `#content` so it doesn't extend beyond the section.
- Text editor toolbar now initializes inside `#content` if available to prevent it from appearing above the section.
- Global widgets are now static when editing other layouts and are excluded from page saves.
- Admin Home page now shows `contentSummary`, `modulesList` and `pageStats` widgets instead of System Info and Activity Log.
- Widgets from other layers are now locked against selection and movement while showing a hover message.
- Widgets from other layers now display a translucent overlay and show a tooltip prompting to change layers when hovered.
- Text editor toolbar now mounts at the top of the `#content` area instead of inside widgets.
- Text editor toolbar is fixed in place so activating it no longer shifts the layout.
- Builder now defaults to "Layer 1" when opening designs and loads the global layout behind it. The unused "Layer 2" option has been removed.
- Global layout toggle removed from the builder footer and designs open directly on their own layer.
- Global layer button restored and labeled "Global" when editing pages; the layout bar is hidden when editing the global design itself.
- Global widgets now appear semi-transparent when editing the main layer so the global layout stays visible in the background.
- Public pages now always combine the global layout with attached designs so shared widgets display everywhere.
- Text block editor toolbar now renders inside the editable area and remains fixed when active.
- ExecuteJs helper centralized in `script-utils.js` so builder and renderer share the same implementation.
- Editor selection is now stored per editor instance for improved reliability with multiple open editors.
- `isSelectionStyled` skips TreeWalker creation for single-node selections, improving performance.
- Style detection logic moved to `styleUtils.js` for clearer separation of concerns.
- Canvas grid now uses shared utilities for snapping and collision checks, removing redundant code.
- Canvas grid documentation covers shared grid utility helpers.
- Builder sidebar now loads panels into a new `builder-panel` container so
  different widgets can display custom panels. The existing text panel
  (`builder/text-panel.html`) loads by default when clicking the text widget.

### Added
* Admin dashboard now features a **grid mode** with an Excel-like layout and a bottom-right resize handle.
* Plus button on Content page lets admins create new designs directly.
* Layout gallery now shows the global design in its own section and lists recent designs below. A default global layout is created if none exists.
* Attached page content now loads automatically, displaying uploaded HTML and attached layouts.
* Page Content widget now lets admins detach uploaded files to switch layouts.
* Content Summary widget includes "Designs" and "Uploaded" tabs listing uploaded HTML pages separately.
* System Settings now includes a Favicon picker using the media explorer. The selected icon is loaded on each page.
- Page Content widget offers a dropdown of available designs when attaching layouts.
- Builder sidebar now features a collapsible text panel loaded from
  `builder/text-panel.html` with quick access to heading, subheading and body
  styles. The canvas scales down when the panel opens.
- Page editor now includes a "Page Content" widget to manage attached HTML documents.
- Content Summary widget now displays available layouts in a responsive grid.
- Layout gallery items link directly to the builder for quick edits.
- Content Summary cards now use interactive div-based layouts with a hover menu
  for opening, copying and deleting layouts.
- Saving a layout now generates a preview image using `html-to-image` so the
  Content Summary gallery always shows the latest design.
- Page Content widget plus button now opens a menu to attach a layout or upload HTML.
- New `customSelect` script automatically converts `<select data-enhance="dropdown">` elements
  into styled div-based dropdowns for consistent theming.


### Improved
- Bounding box overlay is now managed by a single instance emitting `widgetchange` events for cleaner communication.
- `meltdownEmit` now throttles requests to one per second to prevent 429 errors when multiple modules fire off events simultaneously.
- Bounding boxes now update via a shared manager so selection outlines stay aligned during zoom and scroll.
- Resize handles combine translation and scaling so they maintain consistent size at different zoom levels.
- Text editor code split into modular files for easier maintenance.
- Builder editor files reorganized under `core/` and `toolbar/` directories for clearer structure.
- Editor entry point now exports specific functions explicitly for a clearer and safer API.
- Editor and selection modules now register through `globalEvents` instead of attaching duplicate DOM listeners.
- BoundingBoxManager now relies on `ResizeObserver` so seeded widgets report their final size without polling.
- ResizeObserver for bounding boxes starts after the window `load` event so seeded widgets size correctly.

### Fixed
- Added default theme assets to restore builder styling.
- Bounding box uses `ResizeObserver` to update once widgets render, ensuring shadow-root widgets display the correct outline.
- Text editor toolbar now stays positioned below the builder header while scrolling.
- Bounding box updates immediately after layout shifts via `transitionend` and
  `animationend` events, and selection recalculates using `requestAnimationFrame`.
- Bounding boxes now wait for widgets to be connected to the DOM before
  initializing so the outline no longer appears in the corner.
- Bounding box seeding now respects width and height percentages so new widgets
  display at their correct size immediately.
- Widget sizing helper is now shared in `widgetOptions.js` so both the dashboard popup
  and page renderer seed widgets at their correct percentage size.
- Half/third width widget options now apply percentage widths so seeded widgets
  render at the correct size and the bounding box matches.
- Sizing calculations now occur in `pageRenderer.js` so seeded widgets inherit
  correct bounding box dimensions.
- Bounding box visibility now toggles exclusively via `BoundingBoxManager` to
  prevent duplicate DOM updates.
- Bounding box sizing now aligns with percentage-based widget sizes.
- Bounding box now stays mounted when switching layers in the builder.
- Builder grid now imports `BoundingBoxManager` directly so selection outlines
  display correctly.
- Copy layout action in Content Summary widget now includes `moduleName` so meltdown requests succeed.
- Deleting a design from Content Summary works again with the new `deleteLayoutTemplate` event.
- Builder now loads `html-to-image` on demand, preventing module errors outside the editor.
 - Selection boxes refresh during drag and resize and disconnect cleanly when widgets are removed.
- Uploading HTML via Page Content now updates the current page instead of creating a child page.
- Public pages no longer render the widget grid when a layout template or HTML is attached.
- Page Content widget now limits each page to a single attached design or HTML file and replaces existing content when uploading new attachments.
- Page editor now loads attached HTML and layout metadata correctly after a page reload.
- Page editor layout dropdown now lists lane-specific designs and hides the global layout.

- Builder grid now retains a fixed gap below the builder header so the toolbar doesn't shift the layout when activated.
- Bounding box dimensions now read the widget's DOM size before display so first-seeded widgets render correctly.
- Bounding box now generates inside each widget so it always matches the widget size in the builder and dashboard.
- Canvas grid columns now clamp to the container width so widgets can't be dragged outside the grid.

### Removed
- Temporarily removed **themeManager** and the Themes settings page; related widget and menu entries are gone.
- The **Layouts** page in the admin sidebar was removed. The layout editor now opens via the top "Content" link.
- Rate limiter now only applies to the login endpoint; meltdown API relies on JWT authentication.

>\"I think we can put our differences behind us. For science. You monster.\"

## [0.6.2] 2025-07-02

### Added
 - Admin layout edit toggle now opens a widget selection popup.
- Collapsible right‑side pages menu on admin home with filter dropdown and animated toggle icon.
- Toolbar buttons now reflect active text styles; bold, italic and underline states update live with high‑contrast highlighting and fewer spans.
- Community module pages are now automatically seeded under /admin/pages/{slug} when their lane is admin.
- User‑select capabilities for selected and editing canvas items in builder mode.
- debounce utility helper for performant, low‑overhead event handling.

### Improved / Changed
- Changelog formatting updated for consistent bullet lists and headings.
- Builder / CanvasGrid migrated to a ResizeObserver workflow; bounding boxes track live size changes, text widgets follow a two‑step click‑to‑edit flow and the floating toolbar is now rock solid.
- pageRenderer gained applyWidgetOptions – advanced sizing flags (maxWidth, halfWidth, thirdWidth) plus fixed‑percent sizes and overflow control.
- moduleLoader now allows the built‑in crypto module inside sandboxes and keeps its automatic retry logic.
- site.css: new utility classes for the news‑card layout, wider card family and improved hover states.
- Admin canvas grid now scales widgets responsively with percentage-based sizing.
- Updated pages‑menu styles and added an empty‑state hint for better UX.
- Widget popup now shows a backdrop overlay and can be closed with the Escape key.
- Refactored widget rendering to guarantee correct instance handling and stronger error management.
- pages‑menu initialisation rewritten with cleaner event hooks and multiple sorting options.
- Widget rendering now loads in stages with debounced API calls for smoother first paint.
- User color is now cached for the session to avoid repeated meltdown requests.

### Fixed
- Added default theme assets to restore builder styling.
- CodeQL workflow now grants actions: read permission to resolve upload errors.
- Fixed widget preview crash when toggling admin edit mode.
- CanvasGrid percentage sizing now clamps at 100% and remains stable on window resize.
- Dashboard edit mode no longer adds dashed borders around widgets; bounding box sizing uses border-box for accurate transforms
- Admin widgets now render on pages even when not listed in the page config, enabling placement anywhere.
- Existing admin pages now receive missing widgets and layout updates on startup.

>\"Wake the fuck up, Samurai, we have a city to burn.\"

## [0.6.1] 2025-06-27

### Added
 - **requestManager** core module – single, auditable gateway for all outbound HTTP requests with a strict whitelist.
- **DatabaseManager** now understands JSON schema inputs: new events `applySchemaFile` and `applySchemaDefinition` wire straight into the engines and can create MongoDB collections / indexes on the fly.
- **MongoEngine** helper operations `createCollection` and `createIndex` are available when the backing store is MongoDB.
- **moduleNameFromStack** helper pin‑points an offending module by walking the stack trace.
- **Global crash funnel** – `handleGlobalError` traps `uncaughtException` and `unhandledRejection` and forwards them to `meltdownForModule` for uniform recovery handling.
- **Sandbox** now whitelists the built‑in `crypto` module and surfaces only a minimal set of env vars (`OPENAI_API_KEY`, `GROK_API_KEY`, `BRAVE_API_KEY`, `NEWS_MODEL`).
- New environment variables: `GROK_API_KEY`, `NEWS_MODEL`.

### Improved
- **Builder / CanvasGrid** migrated to a `ResizeObserver` workflow; bounding boxes track live size changes, text widgets follow a two‑step *click‑to‑edit* flow and the floating toolbar is now rock solid.
- **pageRenderer** gained `applyWidgetOptions` – advanced sizing flags (`maxWidth`, `halfWidth`, `thirdWidth`) plus fixed‑percent sizes and overflow control.
- **moduleLoader** allows the built‑in `crypto` module inside sandboxes and keeps its automatic retry logic.
- **site.css**: new utility classes for the news‑card layout, wider card family and improved hover states.

### Changed
- Root project bumped to **0.6.2** and **moduleLoader 0.6.1** to reflect the new core plumbing.
- Dependency bump: explicit `crypto@1.0.1` entry for environments that still rely on the deprecated package name.

### Removed
- Entire experimental **News** module and its widgets – never shipped publicly, so all references, related dependencies (`openai`, `brave`) and environment variables were stripped out of the codebase and `package*.json`.


### Note
- The Builder requires more time than planned due to ongoing issues with text editing—accompanied by massive hair loss. Pull Requests to resolve this issue are warmly welcomed.
- **Breaking Change:** Due to major internal updates, reinitializing your setup is necessary after this release.

> \"I don't want to set the world on fiiiiiiiire.\"

## [0.6.0] – 2025-06-21
### Core Rewrite
- CanvasGrid replaces GridStack with a fully custom drag-and-drop builder using GPU-accelerated transforms.
- Dragging and resizing are smoother at 60fps via absolute positioning and ghost elements.
- Added z-index layering controls and enforced boundaries so widgets stay within the grid.

### Text Editing Overhaul
- Text widgets enter edit mode on click and unlock automatically on pointer leave.
- Floating toolbar redesigned with intuitive font size controls and color pickers.
- Text edits sync to both the HTML and code editors.

### UI & UX Improvements
- Polished action bar, font controls and color pickers for a cleaner builder UI.
- Widgets can size using percentages for responsive layouts.
- New bottom layout bar enables quick switching between global and individual layouts.

### Stability & Performance
- Improved request timeout handling to avoid UI freezes and errors.
- Centralized event management provides consistent mouse, touch and keyboard interactions.
- Autosave is debounced with a fallback interval to ensure changes persist without server flooding.

### Removed Legacy Elements
- Eliminated GridStack dependencies and old widget checks for a simpler codebase.
- Consolidated public widgets into customizable HTML Blocks.

This release marks a foundational shift to a fully independent and modular builder.



> "100 push-ups, 100 sit-ups, 100 squats, and a 10 km run. Every single day!"
>
> 
## [0.5.2] – 2025-06-16
- Widgets auto-lock when editing text fields and unlock as soon as focus leaves
  the text, improving editing flow.
- Added font size control to the text editor toolbar for customizing widget text sizes.
- Form inputs in widgets now select and lock the widget when focused, so
  the action menu appears during text entry.
- PlainSpace initialization now registers layout events and creates tables
  before seeding pages, fixing warnings about missing listeners.
- Server initialization no longer hangs if a seeded layout triggers an event
  without listeners. `meltdownEmit` now rejects such cases, preventing staled
  promises during setup.
- Fixed seeding for the Fonts page so the Font Providers widget is available on first run.
- Bounding box respects widget lock state when editing text, preventing accidental resize.
- Fonts widget now shows toggle icons and clearer empty-state text to match other settings widgets.
- Resizing widgets via the bounding box now adjusts their grid position when using the left or top handles.
- Widget selection is restored after editing text so the action toolbar and bounding box reappear automatically.
- Added Fonts Manager core module with pluggable providers and admin page.
- GridStack resize handles are hidden in the builder; the transformable bounding box now manages resizing.
- Added login settings link in the sidebar and redesigned login strategies widget with toggle and edit icons.
- Widgets temporarily lock while editing text in the builder, enabling text selection.
- Preview mode now locks widgets and expands the builder. A new preview header
  lets you switch between desktop, tablet and mobile display ports.
- Heading widget now uses the global text editor toolbar and retains content when opening the code editor.
- User Management tables now include `ui_color` by default and migrations add
  the column if missing, preventing installer failures on SQLite.
- Text block widget reports initial HTML to the builder and is always recognized as editable.
- Fixed text block editor toolbar not opening after custom HTML edits by
  scanning shadow DOM with composedPath.
- Global text editor toolbar activates again after editing widget code by
  traversing shadow DOM to locate grid items.
- User editor now follows the global floating field styling and removes
  mandatory-field checkboxes.
- Restored styling for the user editor with new classes for delete button
  and required field checkboxes.
- Replaced Quill editor with a lightweight contenteditable toolbar (bold, italic, underline).
- Widgets show a dashed border in dashboard edit mode using the user's selected color.
- Fixed floating text editor toolbar missing default controls in builder mode.
- Text editor toolbar now floats below the builder header and edits inline.
- Added drag-and-drop module upload with ZIP validation. Modules require `moduleInfo.json` and `index.js`.
- Module uploads now enforce `version`, `developer` and `description` fields in `moduleInfo.json`.
- User editor revamped with color picker, mandatory-field toggles and delete
  button. Username and email uniqueness is validated before account creation.
- Modules page now uses the header action button for uploads and exposes
  `openUploadPopup` globally.
- Fixed canvas builder crash when adding widgets; CanvasGrid now exposes
  underlying GridStack methods.
- Builder widgets now show a transformable bounding box with resize handles for
  canvas-like editing. GridStack is wrapped via `canvasGrid.js` to keep core
  behavior intact.
- Fixed text editor overlay only activates for text inside widgets, preventing random opens in builder mode.
- Fixed duplicate key error on startup when the userManagement module
  reinitializes with existing MongoDB users lacking email addresses.
- Switching between client and server render modes now works by setting the
  `RENDER_MODE` environment variable or `features.renderMode` in
  `runtime.local.js`. The server strips `pageRenderer.js` automatically when
  `RENDER_MODE=server`.
- `runtime.local.js` overrides now merge feature flags instead of replacing
  them. The sample environment file documents `RENDER_MODE` for clarity.
- Clarified that switching render mode requires configuration changes; no
  runtime toggle exists.
- Documentation on switching the render engine with sections for SSR and CSR.
- Documented how to toggle render mode using the `RENDER_MODE` env var or runtime.local.js.
- Fixed admin layout saving on SQLite by passing placeholder parameters as arrays.
- Text block widget now preserves plain HTML when editing, working with raw text or headings.
- Added floating toolbar to text block widget that appears when editing text in the builder.
- Global text editor overlay works for all text-based widgets in the builder.
- Quill editor now loads automatically in builder mode and opens when clicking any editable text element.
=======
- Admin home screen now hides the sidebar completely.
- Admin widgets subtly adopt the user's selected color across the dashboard for a personalized UI.
- Resolved SQLite `NOT NULL` errors when creating share links; raw SQL placeholders now return parameter arrays.

## [0.5.1] – 2025-06-15
- Startup no longer marks `FIRST_INSTALL_DONE` as true when no users exist, so
  `/install` remains accessible for creating the first admin account.
- Fixed crash when hitting `/admin` or `/login` during setup. The routes now
  catch database errors and fall back to the installer instead of terminating.
- Fixed infinite redirect loop between `/install` and `/login` when
  `FIRST_INSTALL_DONE` wasn't set but user accounts existed.
- `/admin` now verifies installation and user count before redirecting,
  ensuring first-time setups reach `/install` and all subsequent access
  goes to `/login`.
- Admin home now checks installation status and redirects to `/install`
  if setup hasn't finished or no users exist.
- `/login` also redirects to `/install` when the system is not yet set up
  or no users exist.
- POST /install now checks installation status to prevent creating
- Automatically recreates `cms_settings` table if missing to avoid SQLite errors during first-time setup.
  additional admin users after setup.
- Fixed Settings Manager crash on SQLite by converting named parameters to
  positional arrays for `GET_SETTING` and `UPSERT_SETTING` queries.
- Fixed ADD_USER_FIELD placeholder to pass named parameters correctly, preventing SQLite install errors.
- Added /api/meltdown/batch endpoint and `meltdownEmitBatch` helper to reduce request spam from the admin dashboard.
- Fixed first-time install page failing due to incorrect token purpose for user count check.
- Display active public login strategies on the login page.
- Added login settings page with toggleable OAuth strategies.
- Fixed options menu button in the builder action bar to display widget actions correctly.
- Added options menu button to the builder action bar for widget actions.
- Fixed userManagement initialization failure on SQLite by checking for existing columns before adding them.
- Added /install route for first-time setup collecting admin details.
- Widget action buttons now appear as a popup toolbar when selecting a widget, offering lock, duplicate and delete options.
- Builder widgets now show a border in the active user's color on hover.
- Builder widget border is now only visible in builder mode when hovering or selecting a widget.
- Users can now select a personal UI color that sets the `--user-color` CSS variable across the dashboard.
- Theme styles in the builder no longer change menu buttons; active theme now only affects widget previews and background.
- Dynamic action button now hides unless configured and shows as a circle with hover and click animations.
- Redesigned modules list widget with activation toggles and module details.
- Content header edit icon now toggles widget drag mode and saves layout when exiting edit mode. Widgets remain fixed by default.
- Builder footer shows the Plainspace version using a server-injected variable and warns the builder is in alpha.
- Login route now redirects authenticated users and disables caching.
- Refactored page statistics widget to show live counts by lane.
- Quill text editor overlay appears above widget text but stays below menu buttons.
- Quill editor overlay no longer blocks builder menu buttons.
- Added preview mode toggle to the page builder for quick layout previews.
- Scoped theme injection in builder mode for live preview without altering the builder UI.
- Removed global theme injection in builder mode to protect the editor UX.
- Redesigned media explorer with a grid layout and folder navigation.
- Removed content sidebar from admin home screen.
- Admin dashboard now displays the current page title in the header and browser tab.
- Documentation updates for v0.5.0 features: permission groups, layout
  templates, notification hub and widget templates.
- Corrected instructions to open the Notification Hub using the Blogposter logo
  instead of the bell icon.
- Added configurable action button in the content header with a plus icon on the
  Page Management screen for quick page creation.
- Fixed builder page missing global theme injection, ensuring widgets inherit
  active theme styles.
- Page list widget now lets admins edit page titles and slugs inline; press
  Enter or click outside to save changes.
- Fixed page statistics widget to display actual page counts on the admin
  dashboard.
- Documented the layered CSS approach for widgets in the Page Builder.
- Meltdown notifications now use concise text in the Notification Hub while logs keep full details.

## [0.5.0] – 2025-06-11
-- **Breaking change:** delete your existing database and reinitialize BlogposterCMS after upgrading for the new features to work.
- Media explorer no longer throws an error when closed; it now resolves with a `cancelled` flag. Builder and image widget updated.
- Updated all system module versions to `0.5.0`.
- Suppressed console errors when closing the media explorer without selecting an image.
- Snap to Grid option now snaps widget width and height so items align correctly.
- Set body element to use `var(--font-body)` for consistent typography across the dashboard.
- Ensured builder code editor uses global font variables for consistent typography.
- Disabled admin search when not authenticated and show "Login required" placeholder. Token errors now disable the input instead of failing silently.
- Widget list now includes a Templates tab populated from saved widget templates. Builders can save the current widget state as a template and overwrite after confirmation.
- Permissions widget now lets admins create permission groups using JSON and shows seeded groups like `admin` and `standard`.
- Permission groups can now be edited or removed in the settings UI (system groups remain locked).
- Users settings page now lists permission groups with edit and delete controls and the dedicated Permissions page was removed.
- Admin navigation now uses a gradient layout icon for improved visual consistency.
- Text block widget editing now syncs Quill output with the code editor HTML
  field in the builder, allowing manual HTML tweaks.
- Page list widget now prefixes slugs with `/` and includes new icons to view or share pages directly.
- Fixed content header disappearing when grid layout rendered.
- Optimized widget list widget to skip global widget checks when many pages exist, preventing API rate limit errors in the admin dashboard.
- Fixed new default widgets not seeding when `PLAINSPACE_SEEDED` was already set,
  ensuring `widgetList` and future widgets appear after upgrades.
- Fixed "Add new permission" button in user settings to open the Permissions page.
- Added dedicated Permissions admin page with a new widget for listing and
  creating permissions. Default permissions are seeded at startup.
- Fixed admin search not initializing when scripts load after DOMContentLoaded.
- Increased default page request limit and documented `PAGE_RATE_LIMIT_MAX` to prevent search lockouts.
- Added `widgetList` admin widget listing all seeded public widgets with tabs for global widgets. The Widgets admin page is seeded with this widget.
- User management widget now includes a Permissions tab for viewing and creating permissions.
- Widget code editor now includes an "Insert Image" button that uploads to the media explorer and injects an `<img>` tag.
- Improved media explorer usability with larger dialog and backdrop overlay.
- Text block widget now uses a single floating Quill instance instead of creating
  an editor inside each widget's shadow DOM. This avoids focus issues and
  duplicate toolbars.
- Fixed text block editor in builder to clean up tooltip overlays on close,
  preventing multiple toolbars from stacking.
- Widgets can now be marked as global in the builder. Editing a global widget updates all pages that use it.
- Removed Quill editor from the SEO description field in the page editor and
  switched to a simple textarea.
- Fixed text block editor in builder so it closes when clicking outside by
  listening for pointerdown events.
- Fixed notification hub not opening when clicking the logo by initializing after the header loads.
- Fixed text block editor in builder to remove old Quill instances on re-render,
  preventing duplicate toolbars.
- Fixed SEO description editor in builder to remove old Quill instances before
  creating a new one, preventing duplicate toolbars.
- Layout templates widget header reorganized: add button moved next to title and filter tabs aligned left.
- Modules settings widget now separates Installed and System modules.
- Added `moduleInfo.json` to system modules with version `0.3.2`.
- Database initialization now adds missing `preview_path` column for layout templates.
- Sanitized user management event logs to avoid JWT exposure.
- Added notification hub UI and meltdown event `getRecentNotifications`.
- Layout template previews now stored via `preview_path`; widget shows preview images.
- Layout templates widget now includes a create button and rearranged filters below it.
- Increased text block auto-save delay to 1.5s and skip identical saves to reduce API load.
- Added "Layouts" admin page with a layout templates widget.
- Text block editor now closes when clicking outside and uses an empty placeholder.
- Builder widgets no longer lock when using resize handles; only clicks on widget content toggle locking.
- Fixed plainSpace widget instance database operations across all engines.
- Widget instance API now enforces `plainspace.widgetInstance` permission.
- Text block widget content is stored per instance so seeded widgets remain unchanged.
- Debounced text block widget updates to avoid rate limiting while typing.
- Theme stylesheet now loads globally when the builder is active so widgets use
  site colors and fonts.
- Quill editor styles are injected into widget shadow roots for consistent text
  editing.
- Locking now sets GridStack's `noMove` and `noResize` flags to completely disable widget movement while locked.
- Lock icon overlay now uses SCSS with a higher z-index so it always appears above widgets.
- Locked widgets now display a lock icon overlay in place of the resize arrow and cannot be dragged or resized.
- Builder widgets unlock when clicking outside and show a lock icon while active.
- Widgets now lock on click in the builder so they can be edited globally.
- Fixed theme styles not applying in the builder by importing the active theme stylesheet inside widget shadow roots.
- Resolved blank widgets when opening the code editor by loading widget scripts using absolute URLs.
- Fixed builder widgets showing blank when CSS was injected before widget content.
- Text block widget now loads the Quill library and styles on demand so editing
  works in sandboxed widgets.
- Builder widget CSS now loads gridstack and admin styles before the active theme
  to avoid layout conflicts.
- Active theme CSS is now injected into public pages and builder grid only.
- Builder widgets preview using theme styles without affecting the admin UI.
- Implemented "Hello World" default theme with Inter typography, electric-purple accent and micro-interactions.
- Fixed text block widget not showing the Lorem Ipsum placeholder when first
  added and ensured the Quill editor initializes on click.
- Text block widget now displays a Lorem Ipsum placeholder and activates the
  Quill editor on click. Edits are sanitized before being stored.
- Improved text block widget sanitization and only load the Quill editor when
  editing to reduce attack surface.
- Fixed widget code editor so unsaved JS doesn't overwrite HTML when closing the
  builder edit overlay.
- Removed placeholder text from all public widgets to preserve user edits.
- Moved text block widget styles to SCSS for easier maintenance.
- Text block widget now uses a Quill editor with dynamic sizing and HTML
  sanitation.
- Removed Quill from the builder widget HTML editor; now a simple textarea is used.
- Options menu in the builder now appears outside widgets for better visibility.
- Builder widgets now have a three-dot menu with edit and duplicate actions, and the remove button moved to the left.
- Updated README: linked to bp-cli, collapsed screenshots in a details section, added GridStack reference and license header note.
- Improved README structure with an alpha badge, quick install snippet and more descriptive screenshot alt text.
- Added a CONTRIBUTING guide and linked it from the README.
- Styled modules settings widget to match page manager.
- Hardened dummyModule logging and made callbacks optional.
- Fixed dummyModule initialization by using payload-based `performDbOperation` calls.
- Documented dummyModule usage and added developer-friendly comments.
- Translated dummyModule comments to English and expanded template guide.

## [0.4.2] – 2025-06-07
- Fixed admin wildcard route to parse hex page IDs for MongoDB.
- Sanitized meltdown event logs to prevent format string injection.
- Mongo page queries now include an `id` field so admin edit links work.
- Marked `touchstart` handlers as passive in builder and page renderers to avoid scroll-blocking warnings.
- Fixed builder layout saves on MongoDB by preserving string page IDs.
- Kept builder pageId query params as strings so Mongo ObjectIds save correctly without affecting Postgres.
- Logged failed meltdown events to server console for easier debugging when layout saves fail.
- Fixed SQLite "SELECT_MODULE_BY_NAME" to accept array or object params like other drivers.
- Fixed regression test by stubbing `db.run` in the SQLite placeholder test.
- Added example `MONGODB_URI` with `replicaSet` parameter in env.sample and
  updated docs to clarify replica set usage.
- Documented MongoDB replica set requirement for transaction-based modules to prevent startup failures.
- Timestamps now stored in UTC using `new Date().toISOString()` for all `created_at` and `updated_at` fields.
- Ensured Mongo unique indexes are created foreground with retry logic for
  user, page and widget collections to avoid race-condition duplicates.
- Fixed Mongo `SET_AS_START` to run within a transaction using
  `session.withTransaction()` so the previous start page flag can't remain
  active when the update partially fails.
- Fixed Mongo `CREATE_SHARE_LINK` to return the inserted document for driver v4 compatibility.
- Unified ID handling across Server-, Media- and ShareManager for Mongo. Inserts now store an `id` string matching the ObjectId and all queries use that field.
- Fixed Mongo pages missing an `id` field which broke layout loading in `getLayoutForViewport`.
- Mongo `GET_PAGES_BY_LANE` now returns the same structure as Postgres with `trans_*` fields for each translation.
- Unified `GET_PAGE_BY_SLUG` across all databases to return a single page object instead of an array.
- Normalized Mongo `CHECK_MODULE_REGISTRY_COLUMNS` to return `{ column_name }` rows like other drivers.
- Removed legacy Mongo placeholders `SET_AS_SUBPAGE`, `ASSIGN_PAGE_TO_POSTTYPE` and `INIT_WIDGETS_TABLE` to match Postgres parity.
- Fixed "SELECT_MODULE_BY_NAME" placeholder reading undefined variable `data`.
  Both Postgres and Mongo drivers now extract `moduleName` from `params`.
- Added ObjectId validation in Mongo placeholders to prevent crashes from invalid IDs.
- Fixed MongoDB page creation to store lane, language and title so seeded pages
  and widgets appear correctly.
- Fixed MongoDB logins failing when userId strings were not converted to ObjectId.
- Added warnings when admin_jwt cookies are cleared due to invalid tokens.
- Removed `config/environment.js`; `isProduction` now comes from `config/runtime.js`.
- Documented HTTPS requirement for login cookies in `docs/security.md`.
- Added warning when secure login cookies are set over HTTP.
- Added `APP_ENV` variable to toggle production mode via `.env` and updated
  `config/runtime.js` plus documentation to use it.
- Masked password fields in updateUserProfile and user creation logs to prevent
  leaking credentials during debugging.
- Fixed MongoDB logins failing after role assignments. `localDbUpdate` now
  interprets `{__raw_expr}` increment expressions and new users start with
  `token_version` set to `0`.
- Fixed token_version updates on MongoDB. Role assignments now use `_id` when
  incrementing the version so user tokens invalidate correctly.
- Masked passwords in userManagement logs to avoid credential leaks.

- Fixed pagesManager start page setup on MongoDB. `SET_AS_START` no longer uses
  an undefined `client` object, preventing module meltdown and login failures.
- Fixed role lookup when logging in on MongoDB setups. Role IDs are now compared as strings to avoid ObjectId mismatches.
- Fixed user login failing on MongoDB setups. `getUserDetailsById` now queries `_id` instead of `id`, so finalize login works properly.
- Removed deprecated `useUnifiedTopology` option from MongoDB connections to avoid warnings.
- Fixed false "Invalid parameters" errors when MongoDB operations passed an
  object instead of an array to `performDbOperation`. The listener now accepts
  both formats and no longer deactivates modules like `widgetManager` during
  startup.
- Fixed registration on MongoDB setups. `createUser` now recognizes
  `insertOne` results and reconstructs the created user object while
  preserving compatibility with PostgreSQL and SQLite responses.
- Fixed MongoDB database initialization failing when a module user already exists.
  Settings manager now loads correctly and registers event listeners.
- Fixed MongoDB integration. Local CRUD events now translate to Mongo operations
  instead of raw SQL, enabling proper widget management and other features when
  `CONTENT_DB_TYPE` is set to `mongodb`.
- Resolved open handle warning in Jest by stubbing `dbSelect` in the
  `setAsStart` test.
- Updated placeholder parity check to invoke Jest so the script works again.
- Switched test runner to Jest and converted all integration tests.
- Adjusted release workflow to read the changelog from the repository root.
- Fixed default share link domain; now uses `APP_BASE_URL` or `https://example.com`.
- Ensured `library/public` directory is created during startup so media uploads don't fail.
- Fixed image widget state persistence by passing `widgetId` to widgets.
- Fixed role assignment on MongoDB. `dbSelect` now normalizes `_id` to `id`,
  ensuring roles attach correctly during user creation.
- Added test verifying Mongo user collections match PostgreSQL tables.
- Extended parity test to cover all Mongo collections across modules.

## [0.4.1] – 2025-06-05
- Fixed missing CSRF token on admin subpages causing 403 errors when uploading media.
- Added token validation on all admin routes and the meltdown API to prevent
  unauthorized access after a database reset.
- Centralized DB placeholder logic for better maintainability.
- Fixed widget loading on SQLite by using `?` placeholders for generic CRUD helpers.
- Fixed pagesManager meta data on SQLite. Objects are now stored as JSON
  and parsed when reading back.
- Fixed plainSpace layout loading on SQLite. Layout JSON is now parsed when
  fetching to match Postgres behavior.
- Added release workflow that publishes zipped build assets and release notes after running security audits, tests and CodeQL analysis.
- Removed the `cms.sqlite` database from version control and now ignore
  `BlogposterCMS/data` to prevent accidental leaks of local data.
- Prevent logging of full public tokens during pagesManager initialization.
- Verified all SQLite placeholders across modules to ensure inserted IDs use the new return value.
- SQLite engine now returns `{ lastID, changes }` for write operations,
  preventing `Cannot destructure property 'lastID'` errors during page creation.
- Resolved SQLite errors on startup by avoiding `ALTER TABLE ... IF NOT EXISTS`
  and by removing Postgres schema notation when using SQLite.
- Fixed database engine selection. The `.env` variable `CONTENT_DB_TYPE`
  now overrides the legacy `DB_TYPE` to match the documentation.
- The internal database manager no longer requires PostgreSQL when
  `CONTENT_DB_TYPE` is set to `mongodb` or `sqlite`.
- Fixed SQLite initialization race for settingsManager tables and added
  compatibility with older SQLite versions.

### Fixed
- Added default theme assets to restore builder styling.
- Resolved SyntaxError in SQLite placeholder handler causing server startup failure.

## [0.4.0] – 2025-06-04
- CI now verifies placeholder parity for Postgres, MongoDB and SQLite on every
  push.
- Replaced SQLite placeholder handler with full Postgres parity and added
  automated parity test.
- Added Mongo placeholder parity test and CLI command to validate database placeholders.
- Documentation on why custom post types aren't necessary (see `docs/custom_post_types.md`).
- Added UI screenshots to the README and usage guide for easier onboarding.
- Expanded dashboard screenshot series to illustrate widget arrangement.
- Experimental SQLite support added alongside Postgres and MongoDB.
- Added SQLite placeholder handler to support built-in operations.


## [0.3.1] – 2025-06-03

### 🛡️ Security

- **🔥 Big Fat Security Patch™ Edition:**
  Closed **29 security issues** in one glorious cleanup session.
  No, we won’t list every file. Just know: it was ugly, it’s clean now.

- Highlights:
  - Removed **hard-coded credentials** (yes, seriously… 😬)
  - Fixed multiple **XSS vectors** (reflected *and* client-side)
  - Blocked **prototype pollution** (because `__proto__` is nobody’s friend)
  - Added **rate limiting** and **CSRF protection** (finally acting like adults)
  - Sanitized **format strings**, **random sources**, **URL redirects**, and more
  - Killed dangerous **regexes** before they killed your server
  
> If you downloaded BlogposterCMS before this patch, consider it a collectible item.  
> Like a vintage car – dangerous but historically significant.

---

*Commit responsibly. Sanitize often.*


## [0.3] - 2024-05-13
### Added
- Initial changelog file.
- Improved admin widget editing and grid interactions.

### Changed
- Updated form input behavior and label interactions.
- Upgraded Quill editor integration and page list controls.
