# Changelog

All notable changes to BlogposterCMS are documented here. This log starts at
the BlogposterCMS root rebaseline. Earlier detailed history remains preserved
in the private `BlogposterDEV` archive and its 2026-06-26 archive tag.

## [Unreleased]

## [0.7.3] - 2026-09-04

- Made regional container builds reproducible when npm's advisory endpoint is
  unavailable. GitHub CI remains the authoritative full-tree vulnerability
  gate; the registry build installs the exact reviewed lockfile without a
  duplicate network audit, and deployment still requires the matching CI result.

## [0.7.2] - 2026-09-04

- Added the provider-neutral `staticSiteAssets` importer for idempotently
  registering an existing site's local or OSS/CDN-delivered files in Media
  Manager and linking direct references to existing Pages. Downloadable
  application packages keep immutable version/build/checksum identity and
  artifact metadata instead of becoming CMS product records.

## [0.7.1] - 2026-09-03

- Made the shared Node 24 Trixie container base configurable through one
  `NODE_IMAGE` build argument and pinned its official digest. Approved builders
  can use an identity-verified mirror when Docker Hub is unreachable, without
  changing native runtime compatibility, CMS behavior, or persistence.

## [0.7.0] - 2026-09-03

- Aligned both container stages with Debian Trixie after the final-image smoke
  check exposed SQLite 6's glibc requirement on older Debian images.
- Remediated dependency-audit findings across runtime and build dependencies,
  including forged ZIP-size allocation and vulnerable native-install TAR chains.
  Retained Express 4 and the existing authentication/database authorities;
  added ZIP, password-hash and HTTP parser compatibility regressions. CI and
  release validation now use Node.js 24 with the unchanged full-tree audit gate.
- Added an independent non-root server Dockerfile and CI image-build/native
  loading check, with a closed build context and persistent data/media volumes.
  Site content and secrets stay outside images; registry publication, restore
  proof, public routing and production deployment remain explicit operator gates.

- Fixed public routing for nested page slugs so paths such as
  `/guides/getting-started/install` resolve through the existing sanitized
  page lookup while unknown nested paths still fall through to not found.
- Fixed public HTML-only pages receiving an additional empty viewport-height
  widget canvas when no Designer widget placements exist.
- Fixed the canonical `/media/...` runtime path so public page HTML can load
  published Media Manager styles, fonts and images, including while maintenance
  mode is active. Static delivery remains contained to `library/public` and
  keeps the existing source/secret filename guard.
- Fixed widget selection in Auto and Grid Section/Container modes. Placement
  locks still prevent free dragging and resizing, but clicking an active-layer
  widget now opens the same inspector and floating action bar as Free mode.
  Agent feedback declares placement-mode-independent selection.
- Fixed Section resizing at Builder zoom levels other than 100%. The bottom-edge
  handle now remains screen-sized in Fit mode, and pointer movement is converted
  from screen pixels into authored canvas pixels before the Section height is
  persisted. The active Section keeps its resize thumb visible near the
  lower-right edge instead of hiding it behind the centered Add Section action.
  Agent feedback exposes the zoom-invariant resize contract.
- Moved each active Section toolbar away from the shared Section boundary into
  the owning Section's top-right inset. The lower-edge Add Section control now
  remains visually independent instead of merging with the next Section's mode
  and delete actions. Agent feedback exposes the inset placement.
- Fixed the selected-widget action bar remaining visible after clicking an
  empty part of a Section. Section background pointer handling now clears the
  widget, owning grid, contextual behavior controls and inspector selection
  together, including when CanvasGrid consumes the later click event. Scrolling
  the canvas hides the floating bar immediately so it cannot remain detached
  from the selected widget.
- Made the active Design Studio Section's full authored boundary visible with
  filigree editor-only lines on every side. A short opacity-and-scale transition
  now matches the restrained Studio chrome, remains legible at Fit zoom,
  respects reduced-motion preferences and does not alter saved or public page
  styling. Agent feedback reports visibility and presentation.
- Added canonical Section deletion to the Section-owned canvas toolbar while
  retaining the existing storyboard and `scene.delete` command paths. Deleting
  a Section now removes its recursive Container tree and every widget placement
  owned by those grids, selects a remaining fallback Section, and persists the
  reduced page once. The last remaining Section cannot be deleted. Designer
  agent feedback exposes both deletion support and per-Section availability.
- Made the bottom-edge Add Section action visibly insert the canonical Section
  directly below the clicked Section. The new surface now scrolls into view,
  fades in and receives a short accent outline so the insertion is obvious;
  reduced-motion users get a non-moving confirmation. The transient state and
  command source are also available through the existing Designer agent
  feedback contract. The shared page zoom surface now returns to
  content-driven height after CanvasGrid initialization, so added Sections
  extend the white work area and carry their own widgets instead of overflowing
  into the grey editor surround while element chrome remains at the top.
- Fixed Free Placement after switching a Section or Container through Auto or
  Grid: the mode transition now clears temporary CanvasGrid move/resize locks
  immediately, while explicit locks and inactive layers remain protected.
  Replaced automatic Style Source assignment with explicit copy semantics for
  widgets and recursive Containers. `Duplicate` now produces a fully
  independent copy; `Linked copy` clones the current structure and independent
  content once, then links only the corresponding layout/design properties.
  Creating or moving a Container never links it implicitly, and linked
  followers expose a simple `Style linked` / `Unlink style` state. Agent
  feedback reports stale Free Placement locks and the command catalog supports
  independent or linked duplicates through the existing Designer command port.
- Made Design Studio pages Section-first. `#layoutRoot` is now a fixed vertical
  page stack, every storyboard entry addresses the same stable LayoutTree
  Section node, and widget placements persist their immediate grid surface id
  as `workareaId`.
  Authors can add a Section from the lower edge of any existing Section,
  reorder/rename/delete it from the storyboard, resize its bottom edge, and
  cycle Free, Auto or Grid from the compact toolbar owned by that Section.
  Containers are now recursive
  layout items: each Container is positioned by its parent Section or Container
  grid and simultaneously owns a grid surface for its direct children. The
  Layout tree is the sole explicit reparenting surface; the retired Arrange
  mode is no longer wired into the active Designer, and ordinary canvas
  dragging never changes hierarchy by accident. Gap, padding, columns, alignment,
  minimum height and local backgrounds remain LayoutTree settings. Website Body
  background now lives in Global design, page background can inherit it, and
  transparent Sections inherit through page to website. Public Runtime renders
  the same recursive grid tree and agent feedback warns when Section,
  Container and placement surface ids drift. The browser tab keeps the stable
  `Design Studio` app title instead of exposing internal seeded design names
  such as `System / Coming Soon`.
- Unified Design Studio text presets around the existing `textBox` widget.
  Heading and paragraph choices remain fast insert presets, while the text
  toolbar now changes an existing block between H1-H6, Paragraph, Text block,
  Inline text, Quote and Code block without replacing its widget instance or
  content. Changing the role now also clears stale block typography overrides
  so an H1 changed to Paragraph immediately follows the paragraph preset. The
  font-size control now reads and edits the active text block rather than the
  outer Rich Text wrapper, and double-click editing now focuses the registered
  text content instead of accidentally making the complete canvas item
  editable. The text-opacity slider now opens in a viewport-level popover so it
  is no longer clipped behind the horizontally scrollable toolbar.
- Fixed Design Studio behavior and Scene controls: Scroll and Action are now
  deselectable one-shot sidebar shortcuts instead of permanently pressed
  modes, and empty Scenes retain their visible Scene name and quick-insert
  actions after the layout tree is normalized.
- Moved the Design Studio Layers tree into its own fixed left-rail tool beside
  Layout. The right sidebar is now reserved for the selected widget's Content,
  Behavior and Style properties, while the left Layers panel preserves canvas
  selection and forward/backward ordering controls.
- Reworked the Design Studio's left rail so widget types own the full remaining
  sidebar height and only that list scrolls when vertical space is tight.
  Layout and Scene behavior controls remain fixed in separate groups. Selecting
  Text, Media, Shape, Button, Navigation or Content now opens the existing
  preset choices in an anchored popover instead of nesting all widget controls
  inside one scrolling flyout.
- Refactored Design Studio Live Preview geometry so the public Runtime iframe
  always evaluates the exact selected viewport width while a separate visual
  fit scale makes wide pages inspectable on smaller editor screens. The
  Preview bar and agent feedback expose both values. Footer zoom remains
  permanently available, while the Scroll timeline now appears only for a
  selected element with Sticky/Pinned behavior or enabled motion effects.
  Public widget-instance defaults now use the same audited Runtime Manager
  contract in the normal public page and Live Preview; the Preview adapter
  narrowly maps validated `default.*` reads through its existing authenticated
  admin facade instead of failing on or granting a direct PlainSpace bridge.
- Fixed noisy and incomplete development startup paths: the existing SMTP
  integration now ships with its Nodemailer runtime transport, identical
  custom-placeholder registrations are idempotent instead of warning and
  rewriting storage on every boot, Module Loader acknowledges unclaimed
  module-owned `ready` lifecycle signals during process startup, and recurring
  event/auth success traces are opt-in instead of flooding the terminal.
  User lookup diagnostics no longer print credential fields.
- Routed the Design Studio admin app-frame title lookup through the existing
  App Loader and Runtime Manager facade, preserving admin permission checks and
  preventing scope-less `designer.getDesign` events from polluting live logs.
- Unified local development reloads behind `npm run dev`: Sass and Webpack now
  watch their existing source contracts, Nodemon remains responsible for the
  server, and a development-only SSE channel refreshes changed CSS in place or
  reloads dashboard, public and sandboxed app-frame pages after browser-code,
  HTML or server changes. Production does not expose or inject the reload
  client.
- Refined Design Studio selections with larger invisible resize targets,
  smaller direction-aware handles and stable hover positioning. Selecting an
  element no longer adds a background, shadow or position shift to its authored
  content; the bounding box remains the only visual selection layer.
- Merged the overlapping Design Studio widget and Behavior toolbars into the
  existing compact widget action bar. Scroll, Sticky and Pin remain directly
  selectable alongside lock, duplicate, delete and more actions, while the
  range handles stay on-canvas and agent feedback keeps the toolbar association
  tied to the selected widget instance. Text selections also keep the separate
  formatting toolbar clear of the merged selection controls.
- Removed the Design Studio canvas item's transform easing while dragging.
  Widgets now track the pointer directly instead of trailing behind it, while
  border and shadow feedback retain the existing Studio motion.
- Unified the Design Studio viewport slider, Desktop/Tablet/Mobile controls,
  Live Preview frame and agent feedback behind one persisted viewport state,
  while keeping footer zoom as a separate view-only control. The canvas now
  grows symmetrically, keeps widget sizes and centre anchors stable, clamps
  fitting widgets inside the authored page and stores deliberate element
  geometry overrides in inclusive viewport ranges. Builder, Live Preview and
  public runtime resolve the same placement metadata. Runtime grids reproject
  after their actual frame width settles, keep symmetric overflow instead of
  clamping it to one side and normalize fractional device-pixel widths to the
  authored viewport. The sandboxed Live Preview also hides its scrollbar
  gutter without disabling scrolling, so a requested 390px frame remains a
  390px layout surface. The sandboxed app now
  persists that state through the existing
  parent AppBridge without adding `allow-same-origin`; header and full page
  reloads no longer reset the canvas width, displayed values match the applied
  width, and the public-runtime iframe receives the same exact width for
  responsive CSS evaluation. Global viewport presets now live only in the
  header instead of being repeated below every sidebar panel.
- Made Design Studio tools selection-aware: non-text selections no longer open
  the text toolbar, behavior/style controls and the scroll timeline stay
  disabled without an element, and text controls now expose `Default` versus
  `Local override` with a reset to the active Font Package and Color Scheme.
- Secured nested Design Studio Live Preview framing with the existing signed,
  expiring app-origin token. Only authorized preview requests can remove the
  global `SAMEORIGIN` response header; invalid requests fail with searchable
  `DESIGNER_LIVE_PREVIEW_ORIGIN_TOKEN_*` codes, and stalled runtimes report
  `DESIGNER_LIVE_PREVIEW_TIMEOUT` instead of remaining in `loading`.
  Maintenance mode now passes signed Preview requests unchanged to that
  verifier instead of redirecting away the token. The sandboxed runtime receives
  the active Color Scheme, Font Package and validated font catalog in the draft
  payload instead of attempting direct API requests from its opaque origin.
- Expanded the existing Design Studio AgentManager command port with shared
  viewport controls, scene reorder/delete, exact element geometry and stacking,
  duplicate/delete/text formatting, layout container and Style Source
  operations, current Site Preset capture, and explicit save/publish actions.
- Replaced the executable Theme runtime with declarative Site Presets that use
  one contract for installed and user-created packages. Presets can apply
  existing Builder settings, a numbered Color Scheme, a numbered semantic Font
  Package and confirmed page demos composed from central element presets; the
  public runtime no longer depends on a Theme id, Theme CSS or `/themes`.
- Added separate Design Studio `Color scheme` and `Font packages` panels with
  editable `Default 1`, `Default 2`, and later slots. Linked defaults follow
  the active scheme/package, while the existing color and font controls retain
  per-element overrides and expose `Default` to return text to inheritance.
  Panel copy now distinguishes global defaults from local overrides, and slot/
  typography-role switches explicitly restore the selected stored values
  instead of stale browser form-history values.
- Kept an open Design Studio sidebar panel intact while using header or Live
  Preview controls, added meaningful labels to save/timeline/zoom icon buttons
  and clarified the empty-scene actions as quick inserts. Agent visual fallback
  now draws a raster PNG that the existing preview endpoint can serve instead
  of publishing an unsupported SVG data URL.
- Clarified the agent safety guidance so security-sensitive changes require
  reviewing the applicable security policy, keeping changed threat models and
  trust boundaries documented, and testing fail-closed exceptions.
- Added a local-only agent worklog convention with a Git-ignored
  `.agent-worklog/` scratch directory, helper command, docs and policy tests so
  parallel coding agents can coordinate touched paths without committing
  sensitive or temporary notes; interrupted entries now show an expiry timestamp
  and are stale-cleaned on the next helper run after 6 hours without updates.
- Moved Design Studio Scenes out of the primary sidebar rail and into a canvas
  storyboard rail with direct scene selection, rename, ordering and add/delete
  controls exposed through the existing agent feedback snapshot.
- Changed Design Studio canvas editing to use 1px horizontal units instead of a
  12-column editing grid, while keeping percent bounds as the saved/runtime
  geometry contract and adding canvas edge/center plus equal-spacing smart snap
  guides.
- Fixed saved Design Studio design hydration so loaded widgets keep their
  persisted percent bounds before CanvasGrid registration, preventing text boxes
  from appearing tiny until a resize handle is clicked.
- Changed the Design Studio Publish button into a Publishing panel entry that
  stays available in the header, lists linked public pages and the current
  published bundle, and stores the saved `designId` on published pages.
- Fixed the Settings admin surface so its Update Center helper imports the
  Modules data helper with a browser-loadable `.js` module path.
- Fixed the Design Studio stage scrollbar so it stays on the fixed viewport
  edge while the canvas zoom sizer handles centering.
- Improved the Design Studio Layers panel so selecting a layer selects the
  canvas widget, scrolls it into view when needed, and exposes inline
  forward/backward stacking controls.
- Changed the Home workspace into a lightweight first-run entry point by
  seeding Getting Started, Page Stats and Content Summary widgets, restyling
  the Home cards with Studio tokens, retiring older default Roadmap/Drag Demo
  seed widgets on reseed, and softening those demo widgets for existing custom
  layouts.
- Renamed the Design Studio sidebar's user-facing Sections panel labels to
  Scenes so the rail no longer implies vertical page scroll sections or layout
  layers.
- Fixed the Design Studio sidebar flyout so clicking the active rail button or
  the canvas outside the sidebar closes and visually hides the open panel.
- Removed the redundant Design Studio topbar tool strip and moved the remaining
  Scroll/Action behavior shortcuts into the existing sidebar rail.
- Changed Design Studio Live Preview to load the real public page route with
  `?designer-live-preview=1` and removed the standalone legacy preview shell.
- Added a trusted GitHub module updater that checks configured releases,
  verifies ZIP SHA-256 sidecars, reviews new requested access before install,
  health-checks the update package, swaps module folders with backup/rollback,
  and exposes update badges/actions in the Modules admin UI.
- Added a Settings > Update Center surface for checking installed community
  module update sources and installing available GitHub release updates from
  one admin screen.
- Fixed the Design Studio builder header so the app-frame Back control remains
  visibly available as the leftmost exit action.
- Added a safe module modification indicator: module registry responses now
  mark non-empty `data/module-overrides/<module>` folders, and the Modules UI
  shows a red `Modification` badge beside affected modules.
- Added a Design Studio Live Preview frame that renders the current unsaved
  design through the public Runtime renderer with desktop/tablet/mobile
  viewport switches and agent-readable preview status.
- Fixed the Design Studio Live Preview close action so the X button tears down
  the isolated public Runtime frame instead of leaving a stale hidden preview
  in the editor DOM.
- Fixed Design Studio Live Preview rendering parity by normalizing stored
  design/global layout entries before rendering them in the isolated public
  Runtime frame.
- Added Design Studio object snap guides so dragged widgets can align to
  nearby visible widget edges or centers, with the transient guide state
  exposed in the existing agent feedback snapshot.
- Fixed Design Studio snap-guide interactions so text widget hit layers no
  longer override CanvasGrid positioning, resize handles remain usable, and
  object guides no longer pull the live drag preview away from the pointer.
- Fixed Design Studio selection chrome layering so resize handles and outlines
  are no longer clipped at editable canvas edges, while scene viewport guides
  fade behind active selections.
- Restyled the PlainSpace Page Stats widget with stable label/value markup,
  dashboard Studio typography tokens, and a searchable missing-emitter render
  error code.
- Added a Page Management-style create action to Content > Collections that
  creates public collection parent pages through the Pages facade with
  `meta.isCollection`.
- Removed Navigation Studio panel shadows and moved its editor cards to a local
  shadowless card utility with grey 2px bordered and borderless variants.
- Fixed Design Studio publishing so newly created pages receive the saved
  viewport thumbnail in their page metadata instead of only storing the layout
  reference.
- Moved the Settings entry into the top-header account menu and removed it from
  the dashboard workspace-actions navigation.
- Made the Content workspace pages-first by reusing the existing Page List and
  Page Stats widgets ahead of the secondary Content Summary, with the seed
  action metadata aligned to page creation.
- Changed the Content > Design Studio layout browser to the exclusive page-slot
  workspace contract so it fills the surface like Media Explorer and Navigation
  Studio instead of rendering as a half-width dashboard card.
- Changed the Content > Layouts template browser to the same exclusive
  page-slot workspace contract so it also opens as a dedicated full-surface
  admin tool.
- Fixed page-slot dashboard workspaces so full-surface widgets no longer keep
  the normal dashboard bottom padding and empty page scroll below the widget.
- Removed visible hover borders from top-header project, search and account
  controls while keeping their existing hover surface feedback.
- Fixed admin sidebar shadow rendering by keeping the sidebar above content and
  reserving a right-side bleed gutter so circular navigation button shadows can
  paint beside the content edge.
- Fixed top-header account dropdown layering so the menu stays above dashboard
  widgets instead of being clipped by the next content panel.
- Aligned the public login shell with the dashboard Studio token contract by
  removing the login-only dotted background, gradient submit button and rotating
  accent animation while keeping the existing auth form behavior.
- Removed the remaining active pre-v1 contracts: direct app bridge aliases now
  use only `cms-app-runtime-*`, public loader layout sharing uses explicit
  context instead of a window global, PlainSpace public mirror folders are gone,
  Designer service code lives under `mother/modules/designerManager`, module
  static frontends use `staticFrontend`, widgets declare `apiActions`, and the
  retired broad permission bypass is no longer honored.
- Renamed WordPress import-plan term provenance to `sourceWordPressTerms` so
  dry-run output no longer exposes retired contract language.
- Hardened the event-first HTTP boundary so `/api/meltdown` accepts only direct
  facade contracts (`cmsAdminApiRequest`, `cmsPublicRuntimeRequest`,
  `dispatchAppEvent`) plus public token bootstrap, rejects raw core event
  names instead of translating them, and routes Shell, public loaders, widgets
  and the Designer app through Runtime Manager resource/action helpers.
- Fixed module access consent after the event-first hardening by deriving
  grantable community-module events from Runtime Manager's admin facade instead
  of the removed HTTP facade mapper.
- Added an idempotent PagesManager Coming Soon seed that creates a public
  `coming-soon` page for new installations, links a dashboard-styled Design
  Studio tech preview when available, configures `MAINTENANCE_PAGE_ID`, upgrades
  older seed-managed previews, and avoids overwriting custom user pages.
- Updated public page rendering so browser loaders use `cmsPublicRuntimeRequest`
  facades for page envelopes, Design Studio layouts and public widgets, and so
  linked Design Studio pages only render stored HTML as a fallback.
- Stabilized public Design Studio widget rendering with a dedicated static
  public canvas that preserves saved percent bounds, stacks safely on narrow
  screens, passes seed instance metadata into first-party public widgets, and
  emits a ready signal for agent/browser preview checks.
- Fixed local development auto-login so `/login`, `/admin/home` and
  `/admin/app/*` can issue a server-side dev admin session for `DEV_USER`
  instead of relying on the stored password still matching `admin` / `123`.
- Documented the Event-First Transport Boundary decision: Blogposter keeps an
  event-first core, treats HTTP as adapter/facade infrastructure, and should
  migrate new browser/app/widget work toward resource/action runtime facades
  instead of adding domain REST controllers.
- Added a Design Studio `collectionArchive` public widget and Content insert
  preset that renders child pages from a selected collection parent as cards
  with image, title, SEO description and link action through the existing
  public `pagesManager.getChildPages` contract.
- Added reusable Style Source metadata for Design Studio containers and widget
  placements so followers can copy layout/design properties from a source
  object without copying content, with per-object unlink controls.
- Added a concrete Design Studio agent-feedback channel to the existing
  AgentManager/AppLoader surface with structured layout tree, widget placement,
  Style Source, stable-bounds, visual-preview metadata and
  `DESIGNER_AGENT_FEEDBACK_*` warning contracts.
- Clarified contributor guidance for agent-ready architecture: workflows should
  be designed for future agent control through existing contracts without
  exposing every internal function as an agent action.
- Reworked the README into a clearer technical project introduction that
  explains BlogposterCMS, its module/widget/app boundaries and the public
  runtime performance model without generic marketing language.
- Added Design Studio container authoring rules: the root page surface now acts
  as the default free workarea, layout containers expose a floating top-center
  toolbar for auto-add, placement, stack/row/free mode, gap, padding,
  background, workarea and `designRef` controls, and widget placements now carry
  the nearest `workareaId` for runtime-safe container mounting.
- Hardened Design Studio container authoring so toolbar actions, container
  refreshes and layout mutation callbacks fail in isolation with searchable
  `DESIGNER_CONTAINER_*` / `LAYOUT_CONTAINER_AFTER_CHANGE_FAILED` diagnostics
  instead of breaking the Studio UI.
- Added an already-installed modal for stale first-install submissions with a
  direct dashboard-entry action instead of leaving users on the raw
  `SHELL_INSTALL_SUBMIT_FAILED: Already installed` alert.
- Reworked the Design Studio sidebar into a stable circular rail with a compact
  icon-circle Widgets default and right-opening Sections, Layers and Layout
  flyouts so the left surface stays calm while each panel keeps its focused
  controls outside the rail.
- Grouped the Design Studio insert palette into Text, Media, Shape, Button and
  Navigation circles that open preset panels, while keeping first-party widgets
  as technical renderers and hiding `htmlBlock` / the retired `pageEditor` alias
  from normal catalogs.
- Grouped the top-header theme, profile and logout controls into one keyboard
  accessible account dropdown while keeping the existing theme/profile/logout
  handlers.
- Relaxed first-install and login credential checks for local non-production
  dev sessions so `DEV_AUTOLOGIN=true` can use the default `admin` / `123`
  bootstrap without requiring `ALLOW_WEAK_CREDS` to be set separately.
- Aligned the first-install shell with the dashboard Studio theme tokens so
  Light, Dark and System modes use the same canvas, surface, border and button
  styling as the admin workspace.
- Made global `.button` controls borderless at rest and added a delayed shadow
  hover transition without scaling while keeping focus outlines for keyboard
  navigation.
- Added a shared external-link enhancer so cross-origin `http` and `https`
  links automatically drop underlines and receive the north-east arrow marker.
- Moved dashboard chrome hover growth onto background layers so sidebar,
  workspace, project and search controls keep text and icons sharp while
  scaling.
- Reworked the admin dashboard layout contract from free CanvasGrid placement
  to explicit widget slots (`third`, `half`, `twoThird`, `full`, `page`) with
  CSS-grid gaps, raster-column placement, page-sized widget exclusivity,
  slot/column/order persistence, responsive widget-owned height/min-height
  policies, live drag/drop placeholders, pointer-driven widget previews and
  subtle snap-column feedback for smooth dashboard reordering, admin-lane
  removal of widget-instance layout option hydration and default widget
  contracts that no longer derive dashboard sizing from instance width/height
  options.
- Added the first Navigation Studio admin surface on the existing Menu page:
  menu/location defaults, searchable page/custom-link insertion, tree editing,
  preview modes, diagnostics, and optional Design Studio references for Mega
  Menu panels while keeping normal menu styling owned by themes.
- Expanded the Design Studio `gallery` widget with grid/masonry/carousel modes,
  per-image fit and focus metadata, row/column controls, smallest/largest image
  height strategies, slider animation controls and metadata-only renderer
  handling for Designer widget settings.
- Ignored the root-level `data/` SQLite runtime directory after the
  BlogposterCMS rebaseline so local starts do not add database files to Git.
- Added a WordPress Visual Exporter plugin prototype that lets WordPress render
  pages first, exports rendered and normalized HTML with local assets and
  mapping reports, and extended the `wordpressSitePackage` importer to carry
  normalized HTML plus Designer widget hints for future native rebuilds.
- Linked WordPress visual site-package imports back into Pages: rendered package
  pages now create Blogposter page projections, attach saved Designer draft IDs
  when available, keep sanitized HTML fallbacks, and avoid duplicate Content
  Engine mirrors.
- Applied WordPress visual site-package menus, SEO summaries and supported
  Redirection-plugin rules through the existing Navigation, SEO and Redirect
  managers instead of creating importer-owned parallel systems.
- Expanded WordPress visual page source metadata with parent IDs, terms,
  language/translation hints, selected SEO data, featured media and sanitized
  post meta, and ordered visual page imports parent-before-child so Blogposter
  page hierarchy inheritance can apply after migration.
- Added a reproducible `npm run package:wordpress-exporter` build command that
  creates an installable WordPress plugin ZIP for the Blogposter Visual
  Exporter.
- Hardened WordPress Visual Exporter WXR capture so WordPress' native WXR
  headers do not leak into the Blogposter site-package ZIP response.
- Hardened WordPress Visual Exporter frontend capture so a timed-out page fetch
  writes a WordPress-content fallback with `BP_WP_EXPORT_RENDER_FALLBACK`
  instead of failing the whole site-package download.
- Surfaced WordPress Visual Exporter report warnings and remote-asset notices
  in `wordpressSitePackage` dry-run plans so fallback captures are visible
  before applying an import.
- Added the first WordPress visual mapper pass that turns neutralized HTML into
  editable Design Studio draft widgets and preserves unknown fragments as
  `htmlBlock` fallbacks.
- Hardened WordPress visual mapper URL handling so unsafe imported `href`/`src`
  protocols are dropped before native Designer widget drafts are generated.
- Materialized local WordPress site-package assets through the Media Manager
  during import and rewrote rendered HTML, normalized HTML, media metadata and
  generated Designer drafts to the resulting public Blogposter URLs.
- Added a full `manifest.assets` inventory for WordPress visual packages so
  CSS, JavaScript, image, icon and webfont files can be published and rewritten
  separately from media attachment records.
- Added CSS style-hint extraction for WordPress visual imports so dry-run plans,
  content metadata and generated Designer drafts carry color, font, spacing and
  token candidates from packaged local CSS.
- Added WordPress behavior hints that classify page scripts, sliders,
  animations, forms, embeds and unknown JavaScript into rebuild targets without
  executing imported theme or plugin scripts.
- Tightened the WordPress Visual Exporter asset capture so it preserves normal
  navigation links while packaging stylesheet, script, image, `srcset`, poster
  and inline style URL assets.
- Mapped WordPress WXR categories to Blogposter collection page projections:
  category terms now plan `meta.isCollection` parent pages, imported entries can
  receive child page projections, and the importer still keeps original
  WordPress terms as metadata instead of introducing a taxonomy system.
- Preserved WordPress multilingual hints during WXR imports by detecting
  conservative WPML/Polylang-style language metadata, forwarding the language to
  Content Engine/Page projections, and keeping translation group hints in
  `metadata.wordpress.translation`.
- Added runtime presentation inheritance for page hierarchies so child pages can
  reuse the nearest parent `designId` or layout template while preserving their
  own sanitized HTML content.
- Rebaselined BlogposterCMS so the former `BlogposterCMS/` application folder is
  now the repository root.
- Refactored Design Studio layout handling into a shared layout core, added
  public runtime rendering for saved design layout trees, converted quick
  inserts into versioned native element presets, documented the first Design
  Studio widget inventory, and introduced `/admin/studio/design` as the
  user-facing route alias while keeping `designer.*` contracts compatible.
- Added the first bundled Design Studio public widgets: `textBox` now renders
  Rich Text, and new `mediaBlock`, `buttonLink`, `navigationMenu`,
  `breadcrumb`, and `gallery` widgets provide media, links, navigation,
  breadcrumbs, and media galleries without adding a new page-list/collection
  widget.
- Split the former central `app.js` server implementation into focused
  `mother/server/` composition, bootstrap, static-asset, security and HTTP route
  modules while keeping the public routes and module contracts unchanged.
- Replaced the community module `node:vm` runtime with process-isolated module
  runners, added the IPC-backed `moduleHost`/`eventBus` contract for health
  checks, activation and listener callbacks, and documented that Marketplace
  hardening still needs OS/container policy around the runner.
- Added the IPC-backed `moduleHost.storage` facade for community module-owned
  data, with logical table normalization, raw-SQL marker rejection and
  host-marked CRUD requests through the Database Manager.
- Removed user-facing app install/delete routes and runtime facade actions so
  sandboxed apps remain internal admin tool surfaces instead of a v1 app
  marketplace.
- Added permission-checkbox user creation/editing, module-owned permission
  declaration validation, and explicit admin-reviewed module access grants for
  community module install/activation.
- Added a beginner-friendly Community Module Guide with a WordPress comparison,
  minimal module example, manifest rules, access grants, static assets and ZIP
  installation steps.
- Clarified that BlogposterCMS intentionally has no generic plugin type and
  maps plugin-like work to modules, widgets, apps or themes by responsibility.
- Added a dedicated Permission System guide that explains permission keys,
  groups, user checkbox assignment, login-token merging, runtime checks and the
  difference between module-owned permissions and approved module event grants.
- Implemented the community-module consent model: core CMS access is
  default-deny, permanent grants are reviewed during install/activation,
  unapproved runtime calls open a one-time admin prompt, and Settings/Modules
  now shows module permissions, requested access, permanent grants and pending
  prompts.

## Rebaseline Boundary - 2026-06-26

The active BlogposterCMS repository starts from the former BlogposterDEV
application state. Earlier detailed changelog entries remain available in the
preserved private BlogposterDEV history and its 2026-06-26 archive tag.
