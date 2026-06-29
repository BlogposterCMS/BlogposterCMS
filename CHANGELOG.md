# Changelog

All notable changes to BlogposterCMS are documented here. This log starts at
the BlogposterCMS root rebaseline. Earlier detailed history remains preserved
in the private `BlogposterDEV` repository and the `legacy-blogposterdev-2026-06-26`
tag.

## [Unreleased]

- Added an already-installed modal for stale first-install submissions with a
  direct dashboard-entry action instead of leaving users on the raw
  `SHELL_INSTALL_SUBMIT_FAILED: Already installed` alert.
- Reworked the Design Studio sidebar into a stable circular rail with a compact
  icon-circle Widgets default and right-opening Sections, Layers and Layout
  flyouts so the left surface stays calm while each panel keeps its focused
  controls outside the rail.
- Grouped the Design Studio insert palette into Text, Media, Shape, Button and
  Navigation circles that open preset panels, while keeping first-party widgets
  as technical renderers and hiding `htmlBlock` / the legacy `pageEditor` alias
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
  removal of legacy widget-instance layout option hydration and default widget
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
preserved private BlogposterDEV history and the `legacy-blogposterdev-2026-06-26`
tag.
