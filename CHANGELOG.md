# Changelog

All notable changes to BlogposterCMS are documented here. This log starts at
the BlogposterCMS root rebaseline. Earlier detailed history remains preserved
in the private `BlogposterDEV` archive and its 2026-06-26 archive tag.

## [Unreleased]

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
