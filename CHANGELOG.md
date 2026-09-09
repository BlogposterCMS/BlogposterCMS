# Changelog

## [Unreleased]

## [0.10.18] - 2026-09-09

- Publish compatible signed packages for all 37 CMS modules and 31 bundled widgets on the 0.10.17 baseline with asynchronous cold-start verification.

## [0.10.17] - 2026-09-09

- Verify selected module packages in the existing worker during cold starts, keeping database callbacks responsive while all module generations are restored.

## [0.10.16] - 2026-09-09

- Publish compatible signed packages for all 37 CMS modules and 31 bundled widgets on the complete 0.10.15 baseline.

## [0.10.15] - 2026-09-09

- Register GeoIP during host startup so its published individual update package has an active lifecycle. Enforce exact agreement between started modules and the package catalog.

## [0.10.14] - 2026-09-09

- Publish host-compatible signed generations for all 37 CMS modules and 31 bundled widgets, with separate changelogs, for individual update acceptance on 0.10.13.

## [0.10.13] - 2026-09-09

- Complete individual updates for 37 CMS modules and 31 bundled widgets, with signed package-specific changelogs. Preserve admin cookies when authentication dependencies pause during updates; report retryable availability without granting access.

- Share page-editor data and extension access-review helpers between shell and
  widgets, preserving existing service ownership and compatibility exports.

- Add the article dialog and direct page authoring flow, with shared media picking,
  stable content blocks and warnings when a composition has no content slot.
- Refine page rows, page settings, SEO previews, branding and advanced account
  rights through the existing dialogs, controls and save/discard boundaries.
- Add consent-based website visit history, configurable cookie preferences and a
  disabled GA4 connector whose live delivery remains explicitly untested.
- Add the optional GeoIP module with local database and HTTPS service providers;
  it remains disabled until configured and keeps credentials server-side.
- Move the extension ZIP action to the main navigation and refine shared admin
  spacing, loading messages, color picking and dialog dropdown behavior.
- Keep installed update candidates in compact expandable rows with check status
  and timestamps, preserving the existing Update Center services.

## [0.10.12] - 2026-09-09

- Publish compatible signed generations for all 36 modules and 31 bundled widgets, each with its own release notes, for individual production update acceptance.

## [0.10.11] - 2026-09-09

- Keep widget-specific changelog edits compatible with independent updates.

- Enable individual, verified updates for all 36 CMS modules and the 31 bundled
  widget entries in the existing Update Center. Preserve active sessions,
  registries, queues and completed database work across generation changes.
  Designer browser assets travel with its backend; widget assets activate for
  new page loads. Shared host contracts and schema changes remain compatibility
  checks, and each package carries its own signed changelog.

- Document successful live acceptance of all five signed core module updates,
  unchanged CMS process identity, retry after a download timeout and persistence
  after a deliberate restart.

## [0.10.9] - 2026-09-09

- Publish host-compatible signed core module generations for live update
  acceptance on 0.10.8. Module behavior, shared runtime, dependencies and schemas
  are unchanged; the new release identity exercises the official update path.

## [0.10.8] - 2026-09-09

- Supply and verify the mandatory Linux sandbox tools in the existing CI and
  release jobs, including Ubuntu's restricted bwrap AppArmor profile without
  disabling global namespace protection. Version 0.10.7 was not published as a release because the runner
  lacked bubblewrap; this version carries its module, installer and media changes.
  Run sandbox integration under a dedicated unprivileged CI user to retain its
  process limit independently of the GitHub runner's own services.

- Update the locked Nodemailer dependency to 9.1.1 for its security fixes and
  preserve reviewed vendor bytes and LF source files in Windows checkouts.

- Replace module/widget ZIP bars with a header store icon opening the shared
  dropzone/file picker. Place breadcrumbs under navigation with transparent chrome.
- Simplify Storage settings to a connection overview; add/edit opens the shared
  modal with retained failed drafts and a save/discard close guard.
- Add signed independent updates for translation, content, search, workflow and
  export module handlers through the existing Update Center. Verify compatible
  host/schema bytes, persist active generations, drain in-flight work and restore
  old handlers after failed readiness without restarting the CMS. Shared runtime,
  frontend and schema changes continue to require a coordinated host update.
- Enforce backend-only community modules in Linux namespaces with read-only code,
  secret-free environments, seccomp and bounded host messaging. Remove module
  static UI and runtime-consent fallbacks; require current reviewed grants.
  Add Docker seccomp/AppArmor profiles for rootless isolation, omit runner procfs
  and deny further namespace creation. Verify the isolation on the target host
  without granting container capabilities or exposing production volumes.
- Isolate community widget code in opaque-origin workers with an inert UI bridge.
  Require the v2 widget contract and block incompatible packages while preserving
  their files, IDs, settings and saved content. Add read-only migration inventory
  and a real Linux negative-test command; document deployment prerequisites.
  Widget ZIP replacement keeps verified backups and binds live grants to the
  loaded script hash so old instances cannot acquire new-version permissions.
- Make RequestManager egress fail closed with an explicit HTTPS host allowlist,
  pinned public IPv4 addresses, no redirects/proxies and bounded transfers.

- Move storage configuration into Settings > General > Storage. Support multiple
  named connections and show their folders/files in the existing Media Explorer.
  Load provider descriptors from individual adapter files, with local, Alibaba
  OSS, S3-compatible and HTTPS WebDAV adapters; publication selects a destination.
- Move widget management from Content to Settings > Widgets, preserving existing
  page identity and saved state during the admin-page upgrade.

## [0.10.7] - 2026-09-09

- Source tag only: Linux validation stopped publication because bubblewrap was
  absent from the CI runner. No image or release was deployed; see 0.10.8.

## [0.10.6] - 2026-09-08

- Add shared drag-and-drop/file-picker ZIP installation in Modules and Widgets,
  with an explicit manifest access review bound to the inspected package hash.
  Modules expose granular access management; reviewed modules deny undeclared or
  revoked core events without opening a new runtime consent prompt.
- Add widget package inspection/registration and per-service consent under the
  existing Widget Manager and Settings Manager policy. Requests refresh grants
  before dispatch; active streams/local helpers refresh within five seconds.
- Persist UI-installed extension trees and local approval integrity receipts
  across container replacement while retaining the signed core baseline.

## [0.10.5] - 2026-09-08

- Restore UI architecture boundaries for release: download listing uses the shared
  media data client, and website previews and public widgets share presentation
  primitives without shared-to-feature imports. Existing widget URLs and visuals
  remain compatible.

- UI kits now carry named declarative components. Agents insert by component ID
  with optional props through the existing Designer command; compact catalogs
  avoid repeating definitions. Shared previews and public widgets support buttons,
  fields, custom dropdowns/multiselects, choices, tabs, popovers and tooltips.

- Added a responsive Logo widget in Media, backed by Design → Branding settings
  for light/default and optional dark logos, with automatic theme switching.
- Settings → Design now reuses the Designer's color, typography and UI-kit editors
  and shows a named list of actual light/dark previews. Existing JSON color slots
  support optional dark values; public text and buttons use shared defaults while
  explicit local styles remain overrides. UI-kit import/export preserves both modes.

- Preserve native text styling and active translations on Designer save; retain shorthand padding, stacked section sizing, split alignment and single-edge borders.

- Added operator-configured public widget services through Settings Manager for
  named requests, bounded SSE subscriptions, unsent drafts and locale/theme
  preferences. Community modules use the shared public/Designer loader; preview
  cannot invoke authenticated operations. Backend authorization stays external.
- Preserve native widget visual reading order after reload and provide a system
  font fallback when a public page has no body-font token.

- Preserve authored interactive widget hooks through Designer saves and retain
  unavailable widget instances instead of silently dropping them on reload/save.

- Extended Media Manager with bundled local, Alibaba OSS and AWS/S3-compatible
  storage adapters. Added provider configuration, encrypted server-side
  credentials, a saved-connection check and explicit download publication with
  direct delivery URLs, SHA-256 checksums and app-version metadata. Existing
  local Explorer uploads remain compatible; no second file catalog is created.

- Rebuilt Settings as full-height task pages with named, grouped navigation,
  one tab row per page and consistent light/dark surfaces. Modules, users and
  permission groups no longer sit inside nested widget cards. Sign-in methods
  now live with user access; registration has one control with explicit save,
  retained failure drafts and discard. Settings forms show saved/unsaved state,
  keep independent tab drafts and mask the font integration key. Fixed broken
  user/provider editor deep links; editors now share the full Settings page,
  retain failed drafts and refuse to edit empty defaults after failed reads.

- Render shared admin skeletons in the initial HTML, preserve ready chrome during
  content navigation, and replace failed/timed-out loading with an explicit retry.
  Independent shell partials now load in parallel and finish individually.

- Clarified README positioning as a self-hosted Node.js CMS and visual website
  builder, including its extensible framework and backend runtime roles.
- Serve prebuilt browser modules in production and keep TypeScript as a development
  dependency; development retains on-demand compilation. Missing production output
  reports a build error instead of loading the compiler.
- Load only the selected database engine and defer PostgreSQL/MongoDB helper imports
  to their database paths, preserving all supported database variants.

## [0.10.4] - 2026-09-07

- Fixed host updater 1.2.0-1.2.2 storing valid image proof bundles in temporary
  files without a JSON extension, which GitHub CLI rejects before verification.
  Host bundle 1.2.3 preserves the required extension. Release CI now exercises
  the updater's actual image-proof helper with the real anonymous verifier,
  including rejection of a wrong source commit. Signature policy is unchanged;
  existing hosts must install the signed corrected host bundle once.

## [0.10.3] - 2026-09-07

- Host updater 1.2.2 adds bounded connection/attempt/retry limits for signed
  release metadata downloads. Transient verifier network failures retry with
  a hard process deadline and a separate safe network error code; invalid
  signatures and source identities still fail immediately. No raw provider
  URLs or verification diagnostics are exposed. Existing hosts need the signed
  updated host bundle once.

## [0.10.2] - 2026-09-07

- Fixed repeated host-updater installation losing the CMS socket connection.
  The systemd unit now preserves its runtime directory across stop/start, and
  the installer explicitly recreates only the CMS service to reconnect mounts
  left behind by older units. Named volumes, secrets and image selection remain
  unchanged. The existing non-root socket-access check remains mandatory.
  The release requires host bundle 1.2.1 to carry this lifecycle correction.

## [0.10.1] - 2026-09-07

- Fixed public-image updates failing with `CORE_UPDATE_ATTESTATION_INVALID`
  on hosts without GitHub login. Releases now include their signed image
  provenance bundle; host updater 1.2.0 verifies it without API authentication,
  retaining exact digest, repository, workflow, tag and commit restrictions.
  Missing or invalid proofs fail closed. Existing hosts must install the signed
  updated executor once; ordinary CMS image updates do not replace host tools.

## [0.10.0] - 2026-09-07

BlogposterCMS remains in early development. "Stable" identifies the regular
update channel; it does not claim production maturity or freedom from defects.

- Promoted the complete 0.10.0 release-candidate series to the stable update
  channel. Application code is unchanged from 0.10.0-rc.3.
- Includes the Designer and shared UI improvements, container/layout controls,
  page design previews, Analytics and dashboard workflows documented below.
- Includes public HTML attachment compression/compact handoff, viewport-first
  widget hydration and Admin startup improvements, with local measurements and
  their production limits documented in the startup guides.
- Includes the core Update Center and combined server/updater setup from the
  earlier candidates. Configured installations discover this stable release;
  installation remains an explicit administrator action.
- Release artifacts include the signed container image, runtime integrity
  baseline, updater manifest, installer assets and transport checksums.

## [0.10.0-rc.3] - 2026-09-07

- Reduced public HTML attachment transfer by referencing already rendered HTML
  in a versioned bootstrap instead of serializing it twice. Older clients retain
  canonical CSR fallback. Public CSS, JavaScript and SVG now negotiate standard
  response compression while dynamic HTML/API responses and byte ranges remain
  outside the compression filter.

- Public widget layouts now paint their loading placeholders before hydration,
  prioritize widgets in the viewport, and hydrate lower content during idle
  time. Structural designs collect shells across containers before scheduling;
  existing public permissions and all-widgets-ready behavior are retained.

- Promoted Edit design in page details, renamed the existing editor entry to
  Site settings, and added an attachment menu for designs and HTML. Menu links
  target the existing page draft workflow and retain its save/replace guards.

- Added the resolved page design's preview and direct Design Studio link at the
  top of page details, identifying page, inherited and website main designs.

- Fixed overflowing design-library titles and metadata with responsive cards,
  shared action buttons and a bounded fallback for missing preview images.
  Larger previews use truncated titles with the full name available on hover.
  Generated thumbnails now use the existing public media route; legacy generated
  thumbnail share URLs are resolved to their public image files.

- Moved container background editing out of the inspector into its existing
  canvas toolbar, including a transparent reset. Selected container controls
  remain accessible on the design layer.

- Kept Designer available after optimistic save conflicts. Stale writes remain
  rejected, but no longer deactivate the module and break all design reads.

- Fixed the Designer Layers list omitting structural containers and their nested
  objects. Empty containers are visible and selectable as well.

- Fixed text editing changing a widget's logical layer to 9999, which incorrectly
  dimmed and blocked headers/footers as inactive. Editing now elevates only z-index.

- Connected inactive Designer widget overlays to the existing layer switch on
  double-click and reselected the target by stable instance id afterwards.

- Fixed the Designer selection toolbar's inactive Duplicate button by routing it
  through the existing widget duplication command.

- Fixed Studio header mounting inside inspector tabs after shared control styling
  was enabled. The Designer document now owns the header explicitly.

- Fixed missing shared button scope on Designer inspector tabs and removed
  duplicate resize/menu icons from widget corners. Selection actions remain
  available through the existing action bar and inspector.

- Reused shared Blogposter dropdowns, checkboxes and accessible tabs in Designer
  controls without applying admin styles to authored canvas content. Container
  settings are grouped into Layout, Appearance and Behavior; section toolbars
  identify their owning Section.

- Added Container Auto/Fixed pixel height and capability-aware Sticky controls.
  Unsupported positions are disabled with mouse/keyboard explanations; viewport
  Fixed remains unavailable until a matching scaled-canvas adapter exists.
  Height, position and availability use existing layout and agent contracts.

- Added independent top/right/bottom/left Container border widths, including
  right-only Aside separators, through the shared saved/public layout contract.
  Fixed Auto-row Stretch being blocked by CanvasGrid child heights, so an Aside
  can fill the neighboring content column while retaining its minimum height.

- Removed the floating Scenes strip from the Designer canvas. Existing sidebar
  Section navigation, canvas Section-edge controls and saved structure remain.

- Fixed the Studio toolbar inheriting a centered page-header width limit. The
  application header now spans the window independently of canvas sizing.

- Added Container border width, color, line style and corner radius in the
  existing Designer inspector and shared saved/public layout contract. Added
  parent selection and a nearest-Container hover outline so an Aside can be
  distinguished from its menu and owning Section. Agent feedback includes
  border values and the hovered Container id.

- Removed the shared request client's default 100 ms idle gap between ordered
  commands, improving Admin startup and navigation while preserving request
  order, authentication and explicit caller throttling. Fixed Admin pages also
  skip the global layout read whose result their grid does not use. See
  [Admin startup](docs/admin-startup.md) for validation and measurement limits.

- Fixed Designer zoom targeting when another Section is active. Viewport changes
  now reach every nested grid; responsive edits retain container-relative
  coordinates and the selected page breakpoint through resize and save. Removed
  a page/sizer height feedback loop that produced empty space above 100% zoom.

- Highlighted HTML-to-Design-Studio import near the top of the README, with the
  existing capture/import/review workflow and its documented fidelity limits.

- Expanded the README's Design Studio positioning with composition and Style
  Source semantics, backed by an official-documentation comparison of visual
  builders. Distinguished implemented behavior from ongoing usability work
  and avoided unsupported exclusivity claims.

- Designer canvas now preserves authored Section heights and nested content
  flow instead of centering, stretching or shrinking the layout. Layout and
  page-content focus use a removable pale overlay; double-click or Enter switches
  focus without changing saved opacity, structure or the published output.

- Generalized responsive stacking from Home to all editable dashboard workspaces.
  Every dashboard widget exposes a named size container for internal reflow,
  including third-party widgets. Desktop placement remains saved unchanged.

- Designer starts independent user-color, viewport, color-library, font-package
  and preset reads together while still awaiting them before the first canvas render.

- Fixed signed Designer preview boot without a published page, verified in
  client and server render modes. Nested design references retain their public lookup
  instead of receiving the currently edited draft.

- Home's website and operations widgets now both fill the row when available
  content width is at most 1080px. Internal spacing adapts to widget width.

- Removed link underlines from Analytics subpage buttons, including hover and keyboard focus.

- Clarified the README's intended audience and modular visual CMS architecture,
  including extension boundaries, design composition, WordPress import limits
  and the current scope of process isolation. Recorded a proposal for extending
  fault isolation without changing the existing module/event authority.

- Home now starts with a two-thirds website widget and one-third operations
  widget, using existing saved designs and Analytics data. Shared interactive
  charts are available to other widgets through a data-only browser API.
  ECharts 6.1.0 is pinned locally with build-time hashes and browser SRI.
- Saved Designer thumbnails capture the top of the first Section independently
  of editor zoom. DOM capture is now shared with other module/widget consumers.

- Fixed dashboard dragging to replace the original card with its drop placeholder
  and preserve shadow-root content in the preview. Editable dashboards now use
  the surrounding subtle canvas, with rows aligned to the top. The widget drawer
  fits narrow viewports and refreshes its toggle after workspace navigation.

- Clarified the README's AI-first direction with a human/agent collaboration
  example, existing workspace capabilities and current connection limits.
  Linked the workflow and agent-access guides and removed an outdated version
  reference while retaining the development-status warning. Clarified current
  development experience with agent reliability, remaining Designer UI polish
  and human preview/review before agent-assisted publication.

- Analytics is now an editable workspace with Website, Devices & Software and
  System Activity subpages, plus reusable catalog widgets. Existing sidebar Add
  and dashboard controls support custom pages and module widgets. Standard
  Analytics pages are seeded once so removed widgets and user layouts survive
  restarts; the former fixed overview is unlocked without replacing instances.

- Added a separate Analytics admin workspace and reusable overview widget,
  backed by structured authenticated event activity and public HTML delivery
  measurements. Includes periods/comparisons, device/software/referrer groups,
  verified actor/module breakdowns and explicit collection-health reporting.
  Analytics uses the existing event facade and DatabaseManager, with bounded
  queues, 60-day retention and a Node-independent JSON aggregation domain.
  Visitor/session and conversion metrics are not inferred from event counts.

- Added a short English server-installation entry near the top of the README,
  linking to the combined CMS/updater guide and clarifying the local development
  quickstart.

## [0.10.0-rc.2] - 2026-09-07

- Core updates now belong to the protected Updater module, including background
  discovery and authenticated update actions. The ModuleLoader handles optional
  packages; the host executor only carries out fixed requests and retains jobs
  through CMS restarts.
- A combined server installer generates fresh configuration and keys, provisions
  the update connection, and verifies container readiness and socket access.
  Existing installations retain their secrets, deployment paths and data.
  Real Linux installation/cutover acceptance remains pending for this preview.

- Pages can optionally import an English documentation example: three draft
  chapters, a shared draft design, native menu and breadcrumb. Installation does
  not seed it automatically; existing pages and the website main design remain
  unchanged. The existing Pages agent surface offers the same preflight/import.
- Initial public articles have readable first-response defaults and move into
  their saved content area before asynchronous layout widgets mount. The Docs
  example supplies its article stylesheet in the first HTML response, removing
  the unstyled-text flash and retaining light/dark presentation during loading.

- Designer Menu and Breadcrumb elements now have visible source and appearance
  controls. Menus support a sidebar preset, current-page styling, separate
  keyboard-accessible submenu toggles and a collapsible mobile view. Breadcrumbs
  resolve published page titles and parent relationships through the public
  facade, with a configurable start link and path fallback. AgentManager exposes
  the same instance settings through `navigation.configure`; Navigation Studio
  remains the owner of managed menu links. Canvas links stay in the editor during
  editing and navigate normally in Preview. Inspector controls no longer clear
  the selection when the scaled canvas extends behind the panel.
- Pages now use a website-wide main design by default. Each page can load only
  its content into that design, insert an own design into its content area, or
  use an independent design. The centered Pages header selects/opens the main
  design and reports how many pages use it. Settings validates publication and
  a single content area before assignment; explicit legacy page modes remain readable.
  Page content stays independent of its design. SPA editor navigation loads the exact
  selected page instead of reusing the initial shell record.
- Public layouts retain the Designer container tree and render article content
  inside its saved page-content area. Long articles expand Auto/Grid ancestors,
  and article HTML remains present in the first server response. Draft/private
  ancestors and draft designs cannot supply a public shared layout.
- The Designer Layout panel exposes existing Site Presets as UI kits, with
  shared colors, typography, starting blocks and validated JSON import/export.
  Import creates a kit without activating it. Existing agent surfaces expose
  the same layout/content and UI-kit actions, content-host readiness and warnings.
  Widget imports also resolve correctly inside the embedded Designer document.
- Designer content-area controls explain the page-content/page-design outlet;
  Free, horizontal/vertical Auto and Grid remain modes of the same containers.
  Public composition and agent feedback expose main → own design → content,
  with separate content-slot ownership and existing public permission checks.

- Added measured HTML capture import through the existing Importer and Design
  Studio draft flow. Text, images, links and backgrounds retain measured
  responsive geometry and local styling; review warnings identify unsupported
  behavior and source asset dependencies. Safe image markup and text editing
  hooks now survive Designer saves. Imports never publish a page automatically.
  Loading widgets and leaving text edit mode preserve their visual stacking
  order independently of the active editing layer.
  HTML imports now retain semantic Sections and nested source Containers,
  validate parent ownership, report structure counts, and keep child coordinates
  relative to their owning Container across captured viewports.
  Initial Section hydration preserves saved Containers; child pointer events
  no longer drag ancestor Containers. Page-wide backgrounds are split by Section.


## [0.10.0-rc.1] - 2026-09-06

- Preview release: real host provisioning and container cutover acceptance are pending. This release is not offered through the stable OTA endpoint.

- Notification Center now uses compact rows and shared Blogposter light/dark
  surfaces, with keyboard access, loading/empty/error states and refresh recovery.
  Floating feedback shows at most three toasts for three seconds by default;
  hover/focus pauses the remaining time and overflow removes the oldest card.
  Existing update actions and persistent notification ownership are preserved.

- Added core updates to the existing Settings Update Center and administrator
  Notification Center. Signed releases are checked in the background by a
  host-side adapter; administrators can review and install an exact release,
  follow backup/restart/verification progress and see rollback outcomes.
  Provision the optional Unix-socket adapter once during host deployment;
  the CMS never receives Docker or arbitrary command access.

- Added structured agent commands to Pages, the page editor, Navigation, Media,
  widget/design libraries, ordinary settings and CMS navigation. Agents inspect
  and edit the same drafts as people, with revision checks, draft handoff,
  explicit confirmations, busy states and visible operation feedback.
- Designer now reports actual pending/failed saves and publications, supports
  direct content-host and reusable-design commands, and awaits the same publish
  operation as the UI. Its domain adapter replaces the duplicate generic DOM
  controller. Failed commands can no longer be acknowledged as successful.
- CMS host surface reporting uses three permission-checked adapters in the
  existing admin facade; AgentManager/AppLoader remain the transport owners.
- Default account accents and the Default preset now use neutral black, with a
  light inverse and dark labels in dark mode. Page, navigation, widget and module
  selections no longer have a leading accent stripe; page rows use the list's
  full width, with child disclosure controls at the trailing edge.

- Fixed expired JWTs permanently disabling Auth: expiry now rejects only the
  current request with `AUTH_TOKEN_EXPIRED`. First-install checks no longer
  redirect to `/install` on request failures or invalid user-count responses,
  preventing the installed-site login/install redirect loop.

- Designer, widget catalog and public runtime now share widget module execution,
  saved metadata handling and inline HTML rendering. Studio uses the existing
  allowed-path loader and sanitizer, awaits asynchronous widgets, and displays
  the same searchable module errors as the website. Editor controls and public
  credential/CSS isolation remain in their existing adapters.

- Fixed CMS workspaces now fill the available browser height down to the bottom
  navigation. Header heights, sidebar sizing and footer spacing no longer leave
  an empty strip beneath the media Explorer or force the whole page to scroll.

- Fixed a media-picker deadlock: local dialogs no longer occupy the backend
  request queue while waiting for a file selection. Their own file reads can
  complete; actual backend commands keep ordered delivery.
- The Settings entry now opens General instead of an empty dashboard.

- Reworked the shared media Explorer around folder navigation, Back/Forward/Up,
  selectable files, sortable name/type/date/size columns and one contextual
  toolbar. Grid previews and file details retain the shared CMS theme; the editor
  picker now confirms a compatible file explicitly. Browsing creates no shares.
- Media folder creation, rename and deletion now return valid JSON acknowledgments
  after completion, fixing errors reported after successful filesystem writes.
  Folder listings add optional metadata without changing existing name arrays.

- Public pages now include resolved SEO descriptions, canonical links and
  Open Graph/Twitter title, description and image metadata in the first HTML
  response. Existing page SEO fields feed SEO Manager with source override
  precedence; relative image URLs become absolute and empty fields stay omitted.

- Settings now retain independent tab drafts, protect navigation and pending
  saves, and offer Retry after loading failures. The inactive Import / Export
  placeholder is retired; installed module tools retain their ownership.
- Media Explorer ignores stale folder responses, serializes actions and preserves
  load errors through filtering and view changes. Deleted pages are excluded from
  new parent/menu targets and the default Pages filter. Invalid collection-card
  destinations no longer create links back to the current page.
- Removed the unused widget-registration startup RPC and facade entry that caused
  `EVENT_CONTRACT_NOT_REGISTERED` on widget mounts. Actual widget requests retain
  the existing runtime facade permission checks; deploy matching frontend/backend.

- Collections now use a filter in Page Manager, including parent/child context
  and draft collection creation. The duplicate sidebar/catalog entry is retired;
  stored Collections widgets delegate to the same Pages workspace.
- Media, Widgets, Design Studio's library and Page Editor now have fixed CMS
  compositions. Page Editor combines metadata, SEO and content in one explicit
  save, with retained drafts on errors, discard confirmation and pending-write
  protection. The attachment picker supports search, keyboard controls and Retry;
  HTML files load only on selection and HTTP failures cannot become saved HTML.
- Unsaved Pages, Navigation and Page Editor changes now guard CMS navigation,
  browser history and reload. Links inside widget shadow roots use the existing
  admin navigation lifecycle.
- The Widget library now distinguishes available widgets, global instances and
  browser-local templates, with search and recoverable errors. Global usage
  scans all saved page layouts with bounded concurrency instead of returning a
  false empty result on sites with more than 20 pages.
- Home links recent content to the canonical editors and separates failed reads
  from empty results. Demo/checklist widgets are hidden from new catalog insertion
  while existing instances remain loadable.

- Public pages now return their published initial HTML or shared canvas layout
  shell with early asset references. The existing client loaders adopt that DOM
  and envelope, then load widget data without duplicate page/layout requests.
  Initial HTML is sanitized, bootstrap JSON is escaped, responses use no-store,
  and signed Designer previews retain their parent-bridge flow.

- Layout hierarchy and widget editing now operate on the same Designer document;
  opening Layout no longer switches to an empty legacy layer or locks the canvas.
- Autosave for saved standalone designs now writes the complete Designer document,
  including containers and content hosts. Manual and automatic writes are serialized;
  the old additional page-grid save path is removed.

- Designer content destinations now persist independently of the selected scene.
  Embedded and attached designs preserve their container trees; recursive design
  references are bounded. Attached content uses the outer design's content host.
- Retired the legacy Layouts admin entry on startup and removed its assignment
  selector from page metadata editing, preventing SEO saves from changing layouts.
- Section properties now hide inactive Auto/Grid controls in Free placement;
  field styling no longer overrides the hidden state.
- Restored access to existing container insertion and content-host actions in
  the Section toolbar. Public design normalization preserves authored pixel
  positions and sizes instead of losing Free placement without percentages.
- Design library Open actions expose their actual destination and work without
  requiring a popup window.

- Public HTML-only pages no longer download canvas, resize/snap and admin gateway
  dependencies before rendering. Widget pages load the existing canvas helpers
  on demand alongside their registry read, with a searchable import error.
  See `docs/public-startup-performance.md` for the remaining startup waterfall.

- Simplified Navigation Studio around menu selection, link structure and a
  compact editor using existing Blogposter fields and theme surfaces. Adding
  links uses an explicit parent; advanced options and preview are secondary.
- Navigation edits survive local view changes, report write errors and prevent
  duplicate in-flight actions. Fixed nested drag bubbling, page-target URLs,
  inactive preview links and clearing legacy parent/source references.

- Page Management now combines a searchable page hierarchy, status counts and
  selected-page details in one workspace. Details save explicitly together;
  draft/subpage creation, unsaved-change confirmation and failed-refresh recovery
  use the existing Pages service. Content, Pages and Navigation have fixed
  compositions with no widget placement controls; Home remains customizable.

- Admin widget cards now reuse the login card's subtle border, solid surface and
  soft shadow in both themes; grid mode preserves their border and edit feedback.

- Admin backgrounds now follow light/dark theme tokens instead of public website
  colors. Sidebar backing, widget icons, collection/layout surfaces and scrollbars
  follow the shared theme. The maintenance notice uses existing neutral surfaces
  and correctly respects its hidden state.
- Widget catalogs support keyboard insertion and explicit empty-search feedback.
  Gallery sliders clip their track, calculate relative slide offsets, disable
  unavailable directions and prevent focus on hidden fade slides. Design library
  loading failures are distinct from empty results and provide Retry.

- Fixed public startup waterfalls: public facade reads run with at most four
  concurrent requests, while commands retain their ordered queue. Page discovery,
  colors and font packages load concurrently before rendering.
- Core public loaders use their explicit mount directly, avoiding failed community
  path probes. HTML-only pages no longer fabricate a Designer layout reference
  and wait for a failing layout request; linked designs retain ordered loading.

All notable changes to BlogposterCMS are documented here. This log starts at
the BlogposterCMS root rebaseline. Earlier detailed history remains preserved
in the private `BlogposterDEV` archive and its 2026-06-26 archive tag.

## [0.9.5] - 2026-09-06

- Fixed expired JWTs permanently disabling Auth: expiry now rejects only the
  current request with `AUTH_TOKEN_EXPIRED`; valid subsequent requests and
  public-token issuance remain available.
- Fixed the login/install redirect loop during failed installation checks.
  Request failures and invalid user-count responses retain the current page
  instead of treating an unavailable check as an empty installation.
- No database migration. Existing instances locked by the previous expiry
  behavior recover when the update replaces and restarts the container.

## [0.9.4] - 2026-09-05

- Changed the shared default accent from bright teal to a restrained Studio
  blue with a white foreground. Existing saved user accents remain authoritative.

## [0.9.3] - 2026-09-05

- Moved the CMS sign-in page to `/admin/login`, including admin redirects,
  logout, registration and installation links. Public `/login` now belongs to
  site content and configured redirects instead of opening the CMS sign-in.
  Authentication, CSRF protection and the login API remain unchanged.

## [0.9.2] - 2026-09-05

- Restored native-browser loading of the public Designer and Widget loaders.
  Both reuse the existing browser ESM runtime facade instead of importing the
  server-only CommonJS backend event catalog. Transport, authorization, payloads
  and rendering remain unchanged; deployed-JavaScript boundary tests protect
  against module-resolver false positives.

## [0.9.1] - 2026-09-04

- Fixed production startup on isolated networks: release images now package
  TUF-verified public GitHub/Sigstore trust roots and use the verifier's offline
  mode without weakening repository, workflow, tag or source-commit checks.
  Missing packaged roots fail closed with `RUNTIME_INTEGRITY_TRUST_ROOT_MISSING`.
- Added a credential-free, network-disabled final-image integrity/native check
  to release CI. Branch CI checks the non-deployable build stage; only signed
  release inputs can produce the final production image.

## [0.9.0] - 2026-09-04

### Update safety

- Extended the updater trust chain to the initial installation and every
  production process start. Release automation now externally attests both the
  update manifest and a complete runtime SHA-256 baseline; startup fails closed
  on core/dependency drift and blocks changed community modules before event
  registration. The baseline includes unusual executable extensions instead of
  trusting filename suffixes, with stable audit codes and no local re-signing
  path.
- Moved mutable Notification Manager registry state and FileLog output into
  `data/notificationManager`. First start initializes from signed read-only
  defaults, updates preserve existing user configuration, and the host updater
  performs a non-overwriting one-time migration from older containers.

### Backend architecture

- Replaced the legacy backend-event caller layer with generated `BACKEND_EVENTS`
  constants, event-specific executable payload schemas and matching TypeScript
  payload/result declarations. Promise callers now use the shared request
  helper without private adapters, direct callback emits or temporary callback
  forwarders; stable errors, result validation and bounded deadlines apply at
  the same boundary. `npm run migrate:backend-events` upgrades old checkouts and
  regenerates all contract artifacts, while `npm run check:backend-events`
  blocks names, adapters, unbounded schemas and generated-file drift. Callable
  payloads are also inferred through listener destructuring and `typeof`
  guards, preventing provider and strategy functions from being rejected as
  JSON during registration.
- Split Runtime Manager facade maps and domain-specific dispatch rules into
  content, presentation, access and platform modules without changing facade
  events, permissions, resource/action names or response envelopes.

### Admin interface

- Unified admin widget controls with the existing Studio UI kit: ShadowRoot
  widgets now receive the scoped form/button rules, dynamic single-selects use
  the shared non-native dropdown, Settings uses structured fields and action
  groups, and Page Management uses responsive table rows plus accessible
  floating icon actions. The bundled Lucide SVG assets remain the single icon
  source.
- Added the authenticated Settings > UI Kit component gallery and completed
  the shared admin primitives for labelled fields, switches, accessible tabs,
  popovers, transient toasts, loaders and progress. The live gallery exercises
  dialogs, prompts, custom dropdowns, the color picker, feedback states, data
  display and bundled Lucide icons as executable developer documentation.

## [0.8.0] - 2026-09-04

- Added a pull-only CMS core updater and release contract that publishes the
  complete digest-pinned server image with GitHub provenance, backs up named
  data/media volumes, verifies readiness and packaged version, and restores the
  previous image plus data automatically when cutover fails.
- Activated the existing per-module `data/module-overrides/<moduleName>` tree
  for declared static frontend paths. Overrides are resolved before managed
  module files, survive module/core updates, remain read-only in the supplied
  deployment layout, and cannot replace backend entries or manifests.
- Added bounded `/health/live` and `/health/ready` responses so deployment tools
  can distinguish listener availability from a version-verified ready runtime.

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
