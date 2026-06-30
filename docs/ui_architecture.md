# UI Architecture

BlogposterCMS keeps the browser UI separate from the server runtime. The server
can stay Node.js for now and later move core services to Go or Rust, while the
UI keeps a stable TypeScript/JavaScript boundary.

## Zones

- **Shell**: admin navigation, login, settings, users, media, notifications.
- **Designer**: canvas builder, selection, history, toolbar, layout tree,
  placement, publishing.
- **Runtime**: public page renderer. This bundle should stay minimal and never
  import shell, admin-only shell helpers, or designer code.
- **Widgets**: widget SDK, bundled widgets, and future sandbox adapters.
- **Shared**: API clients, event contracts, schemas, and design-system tokens.

The target source tree is `ui/`. Active Shell, Designer, PlainSpace dashboard,
PlainSpace runtime, widget-panel, and shared UI sources live under `ui/`.
`public/` and `apps/designer/` hold HTML shells, CSS/assets and bundle entry
points only.

Active Webpack bundles start from TypeScript-authored
`ui/<zone>/entries/` modules. New browser entrypoints should not be added
directly under `public/` or `apps/designer/` implementation folders. The server
exposes `/ui` as the canonical static mount for trusted first-party browser
modules.

## API Boundary

UI code should not know how server modules are wired internally. It should use
shared clients such as `ui/shared/api-client/meltdownClient.ts` and typed event
contracts from `ui/shared/contracts/`.

The HTTP `/api/meltdown` edge rejects direct database/system events and raw
placeholder payloads. Browser code should treat it as a transport for public
token bootstrap, public-safe events and facade contracts such as
`cmsAdminApiRequest`, not as a way to call backend internals.

The add-on vocabulary is intentionally limited:

- **Modules** provide backend capability contracts.
- **Widgets** render reusable UI blocks and never reach into server internals.
- **Apps** provide isolated admin/tool surfaces and query the CMS through public
  APIs or the `runtimeManager` admin facade.

Iframe apps may send lifecycle messages through `dispatchAppEvent`. Backend
commands from apps must use the `cms-admin-request` bridge shape
`{ resource, action, params }`; the server routes that through
`runtimeManager.cmsAdminApiRequest` and rejects arbitrary app event names.

The host browser globals are:

- `window.blogposterApi`
- `window.meltdownEmit`
- `window.meltdownEmitBatch`
- `window.fetchWithTimeout`

New UI code should prefer `blogposterApi` or direct imports from shared clients.

## Active Bundle Entries

- `ui/shared/entries/*`: cross-zone browser helpers such as meltdown transport,
  icons, fonts, token loading, the development banner, and small UI utilities.
- `ui/shared/agent/*`, `ui/shared/controls/*`, `ui/shared/dev/*`, `ui/shared/dialogs/*`,
  `ui/shared/grid/*`, `ui/shared/icons/*`, `ui/shared/media/*`, `ui/shared/sanitize/*`,
  `ui/shared/utils/*`, `ui/shared/scripts/*`, and `ui/shared/vendor/*`:
  shared agent-surface primitives, controls,
  development helpers, dashboard modal/prompt primitives, browser icon globals,
  Media Manager Explorer clients/surfaces, HTML/CSS sanitizing, shared CanvasGrid primitives, small browser utilities,
  CSP-aware script execution, and vendored browser libraries. Non-vendor shared primitives are
  TypeScript-authored.
- `ui/shared/loaders/*`: TypeScript-authored token, favicon, and font
  bootstrap helpers that expose only typed browser globals.
- `ui/shell/entries/*`: admin shell, login, install, registration, navigation,
  app-frame bridge, notifications, and admin page actions.
- `ui/shell/data/pageDataLoader.ts`: TypeScript-authored admin page-data
  cache and bootstrap helper exposed through `window.pageDataLoader`.
  Initial page-data payload construction, result unwrapping, field
  sanitization, and cache keys are owned by the adjacent
  `pageDataLoaderData.ts` helper.
  Public install/registration token bootstrap and public setting payloads are
  shared through `ui/shell/data/publicMeltdownClient.ts` so public shell pages
  do not rebuild `/api/meltdown` module payloads inline.
- `ui/shell/apps/appFrameLoader.ts`, `ui/shell/auth/login.ts`,
  `ui/shell/auth/loginStrategiesPublic.ts`, `ui/shell/auth/register.ts`,
  `ui/shell/dashboard/adminDashboard.ts`, `ui/shell/dashboard/fetchPartial.ts`,
  `ui/shell/dashboard/contentHeaderActions.ts`,
  `ui/shell/dashboard/pageActions.ts`,
  `ui/shell/install/firstInstallCheck.ts`, `ui/shell/install/install.ts`,
  `ui/shell/media/openExplorer.ts`, `ui/shell/notifications/notificationHub.ts`,
  `ui/shell/search/adminSearch.ts`, and `ui/shell/theme/userColor.ts`:
  TypeScript-authored shell helpers behind the corresponding entry bundles.
  App iframe bridge payload construction, batch forwarding, lifecycle dispatch,
  and appLoader response unwrapping are owned by `appFrameLoaderData.ts`.
  Public login-strategy token issuance, active strategy loading, and
  public/global filtering are owned by `loginStrategiesPublicData.ts`.
  Public registration availability and register payloads are owned by
  `registerData.ts`. First-install status, user-count checks, and install POST
  payloads are owned by `installData.ts`; the install shell still applies
  `userColor.ts` theme mode so Light, Dark and System follow the dashboard
  token contract.
  Dashboard page creation/layout-template event payloads, content-header admin
  page deletion data, page-picker list/order/create/redirect payloads, admin
  search, maintenance-mode setting payloads, theme-mode document token binding, workspace navigation page
  list/create payloads, media explorer picker mounting, notification hub,
  and user-color event payloads and response normalization are owned by the
  adjacent `adminSearchData.ts`,
  `pageActionsData.ts`, `contentHeaderActionsData.ts`, `pagePickerData.ts`,
  `topHeaderActionsData.ts`, `workspacesData.ts`, `openExplorerData.ts`,
  `notificationHubData.ts`, and `userColorData.ts` helpers.
  Top-header account chrome groups theme mode, profile and logout actions in
  the account menu partial; `topHeaderAccountMenu.ts` owns its
  keyboard/outside-click binding, while `userColor.ts` keeps the theme icon and
  visible menu label in sync.
  Dashboard alerts, confirmations, prompts, and custom modal content must use
  `ui/shared/dialogs/bpDialog.ts`; feature code should not call native browser
  dialogs directly when it is running inside the dashboard shell.
- `ui/runtime/entries/*`: public and admin page rendering entrypoints.
- `ui/runtime/publicEntry.ts`, `ui/runtime/entries/publicEntry.ts`, and
  `ui/runtime/envelope/*`: TypeScript-authored public runtime boot, page
  envelope orchestration, and loader registry helpers. `publicEntry.ts`
  exports the boot function without starting the page; the entry module owns
  the browser side effect. `ui/runtime/publicLoaderImporter.ts` owns module
  public-loader discovery, validated import paths, dynamic import, and loader
  registration.
- `ui/runtime/main/pageRenderer.ts`: page rendering for public and admin lanes.
  The main module exports `bootPageRenderer()` without starting itself; the
  `ui/runtime/entries/pageRenderer.ts` bundle entry owns the browser side
  effect. Runtime widget dependencies pass through
  `ui/runtime/main/widgetRuntimeGateway.ts`. Admin-only settings surfaces are
  loaded lazily through `ui/runtime/main/adminWidgetSurfaces.ts` only after the
  renderer has resolved an admin settings page. Dashboard edit controls are
  also lazy-loaded through that admin gateway only in the admin lane.
  Browser route context, admin page title updates, and the runtime widget
  registry global are owned by `ui/runtime/main/runtimePageContext.ts`.
  Admin-lane link interception and history navigation are owned by
  `ui/runtime/main/runtimeAdminNavigation.ts`, which re-renders page content
  without replacing the mounted dashboard shell.
  Admin dashboard grid setup, attached content, and persistence orchestration
  are owned by `ui/runtime/main/runtimeAdminGrid.ts`, with browser interactions,
  responsive columns, window globals, drop placement, and layout persistence
  delegated to `ui/runtime/main/runtimeAdminGridInteractions.ts`. Admin canvas
  item creation, projected widget placement, instance metadata mapping, and
  admin widget mounting are owned by
  `ui/runtime/main/runtimeAdminGridMounting.ts`. Canvas item selection,
  hover, bounding-box, and shadow-root resize-handle chrome should use the
  shared Studio token contract from `public/assets/scss/_variables.scss` rather
  than raw user accent colors. Scene metadata and
  appearance normalization are owned by `ui/runtime/main/sceneRuntime.ts`, while
  runtime scroll/motion effect binding and animation-frame updates are owned by
  `ui/runtime/main/runtimeSceneEffects.ts` so the renderer stays focused on page
  and widget orchestration. Canvas item wrapper construction, placeholders,
  mounted content nodes, layout rect projection, and layout metadata
  application are owned by `ui/runtime/main/runtimeCanvasItems.ts`. Runtime
  canvas item/layout serialization for persistence is owned by
  `ui/runtime/main/runtimeCanvasSerialization.ts`. Sanitized runtime HTML
  insertion and empty-state DOM fallbacks are owned by
  `ui/runtime/main/runtimeContentFallbacks.ts`. Grid
  Design widget normalization and safe design surface styling are owned by
  `ui/runtime/main/runtimeDesignLayouts.ts`. Grid measurement, fallback sizing,
  and static grid scaling are owned by `ui/runtime/main/runtimeGridMetrics.ts`.
  Runtime grid layout item projection, widget lookup, canvas item mounting, and
  widget render dispatch are owned by
  `ui/runtime/main/runtimeGridWidgetMounting.ts`.
  Attached content discovery, child page rendering, and attached
  design/layout/HTML fallbacks are owned by
  `ui/runtime/main/runtimeAttachedContent.ts`. Public runtime page composition,
  static grid mounting, and fallback selection are owned by
  `ui/runtime/main/runtimePageComposition.ts`, with concrete public/static grid
  creation, metrics selection, and grid widget mounting orchestration delegated
  to `ui/runtime/main/runtimeStaticGrid.ts`. DOM shell creation,
  global style injection, and renderer URL sanitizing are owned by
  `ui/runtime/main/runtimePageShell.ts`. Shell partial fetching, sanitized
  hydration, admin content-only hydration, partial fallback, and load events are owned by
  `ui/runtime/main/runtimeShellPartials.ts`. Handlers for those load events must
  be idempotent because widgets can refresh a shell area without replacing the
  whole partial. Runtime data
  event payloads, lane auth, and page/layout/widget/design requests are owned
  by `ui/runtime/main/runtimePageData.ts`, with auth payloads, response
  normalization, data unwrapping, and widget lane resolution delegated to
  `ui/runtime/main/runtimePageDataHelpers.ts`. Widget API-event registration
  and debounced runtime event batching are owned by
  `ui/runtime/main/runtimeWidgetEvents.ts`. Runtime widget context construction,
  scene dataset extraction, and admin-token exposure are owned by
  `ui/runtime/main/runtimeWidgetContext.ts`. Inline widget HTML sanitizing, CSS
  injection, and custom JS execution are owned by
  `ui/runtime/main/runtimeWidgetInlineCode.ts`. Runtime widget shadow-root setup,
  global CSS import, form-control drag protection, and resize slot creation are
  owned by `ui/runtime/main/runtimeWidgetShell.ts`; form-control protection must
  let the original target handler run before stopping propagation to the outer
  drag layer. Guarded dynamic widget
  module loading, blocked-path logging, runtime context handoff, and import
  errors are owned by `ui/runtime/main/runtimeWidgetModuleRenderer.ts`. Runtime
  widget shell/event setup plus inline-code-or-module dispatch are owned by
  `ui/runtime/main/runtimeWidgetRenderer.ts`. Default widget instance option
  loading and application are owned by
  `ui/runtime/main/runtimeWidgetInstances.ts`. Widget definitions may carry a
  `layout`/`metadata.layout` size contract with named slots such as `third`,
  `half`, `twoThird`, `full` and `page`. PlainSpace publishes explicit
  contracts instead of deriving dashboard sizing from widget-instance
  width/height hints, so the admin dashboard can mark each flow item with the
  active slot. The same shared slot helper resolves widget-owned height
  policies (`dynamic`, `auto`, `scroll`, or `fixed`) and mobile-first
  `minHeight`/`height`/`maxHeight` values into CSS variables on the dashboard
  wrapper.
  Widget hydration state and the
  shell-first paint delay are owned by
  `ui/runtime/main/runtimeWidgetHydration.ts`, so dashboards can mount stable
  layout placeholders before widget imports and data work start. The per-item
  mount pipeline that applies those defaults, renders widget code, and marks
  widgets `ready` or `failed` is owned by
  `ui/runtime/main/runtimeWidgetMounting.ts`.
- Admin dashboard layout is intentionally separate from CanvasGrid. It uses the
  flow controller in `ui/runtime/main/runtimeAdminGridInteractions.ts` plus the
  slot helpers in `ui/shared/layout/dashboardSlots.ts`; saved admin
  dashboard entries store `slot`, `column` and `order`, not free pixel
  placement or user-defined sizes. Widget height and minimum readable height
  stay in the widget metadata contract, not in user layout state.
  Drag-and-drop within this flow uses a dashboard-only placeholder and
  `beforeInstanceId` insertion hook plus pointer-preview/snap feedback, leaving
  CanvasGrid drag behavior scoped to Designer/public surfaces.
  The admin lane skips widget-instance layout options during hydration;
  `applyWidgetOptions` and percent-to-grid-unit sizing are reserved for
  CanvasGrid/public-style surfaces.
  Designer Studio and public/static runtime grids may continue to use
  CanvasGrid-style percent geometry where free placement is the actual editing
  model.
- `ui/shared/grid/*`: shared CanvasGrid implementation, geometry, global event
  wiring, and bounding-box helpers used by Shell, Runtime, PlainSpace, and
  Designer through stable shared paths.
- `ui/runtime/grid-core/*`: stable runtime grid re-exports for geometry,
  global events, bbox, and the small event emitter.
  `ui/runtime/main/{canvasGrid,BoundingBoxManager,grid-utils,globalEvents}.ts`
  and `ui/runtime/grid-core/*` forward to `ui/shared/grid`.
- `ui/shared/partials/*`: shared partial loading helpers. Runtime code must use
  these shared helpers instead of reaching into `ui/shell/`.
- `ui/shared/agent/*`: shared AgentManager browser clients and DOM surface
  adapters. App, Shell and Designer code use these helpers to publish
  agent-readable snapshots and handle centrally queued commands.
- `ui/shared/media/*`: shared Media Manager browser clients and the Explorer
  DOM surface. The dashboard Media page, shell picker, and future global media
  modal should mount this surface instead of rebuilding folder, upload, share,
  rename, or delete payloads in each caller.
- `ui/shared/apps/appBridge.ts`: shared sandboxed iframe bridge. It installs
  `window.meltdownEmit` inside app iframes, forwards requests to the parent
  AppLoader bridge and starts the generic DOM agent surface adapter when the
  app manifest opts into `agentSurface`. Designer shells load the emitted
  `/build/appBridge.js` bundle directly; `apps/designer/` must not keep a
  separate app-bridge file.
- `ui/shell/apps/appFrameLoader.ts`: parent-side app iframe bootstrap. It sends
  init tokens on iframe load and repeats them briefly after registration so
  fast same-host app frames do not miss the handshake while staying sandboxed.
- `ui/designer/entries/*`: designer and editor bundles. The
  `/build/designer.js` entry is a small bootloader that lazy-loads the
  Designer app chunk, keeping the shell entry below the production asset budget
  while preserving the single script URL used by the Designer HTML shell.
- `ui/designer/app/*`: active Designer implementation. The `apps/designer/`
  tree keeps assets, partials and app metadata only. Sandboxed Designer frames
  verify parent origins through the
  public `/apps/designer/origin-public-key.json` CORS endpoint before accepting
  init tokens. Designer bootstrap applies the shared Shell theme mode from
  `ui/shell/theme/userColor.ts`; Designer CSS should map builder
  variables onto the dashboard Studio tokens instead of defining an independent
  light/dark contract.
- `ui/shared/layout/*`: shared Design Studio layout contract. It owns
  `LayoutTree`, `WidgetPlacement` and `DesignDocument` normalization plus DOM
  serialization, rendering and container operations used by Designer adapters
  and the public runtime. Container mode and surface settings live on
  `LayoutTree` nodes, while free-positioned widgets keep percent geometry and
  point back to their owning container through `workareaId`. Shared
  `styleSource` metadata lives here as well so containers and widget
  placements can reuse layout/design properties without copying content.
- `ui/widgets/entries/*`: widget-panel and future widget runtime bundles.
- `ui/widgets/options/*` and `ui/widgets/rendering/*`: reusable widget sizing
  and rendering helpers. Runtime and Shell may consume these; Widgets must not
  reach back into Runtime, Shell, or Designer. `ui/widgets/options/widgetOptions.ts`
  coordinates option application while
  `ui/widgets/options/widgetOptionDom.ts` owns concrete option-to-DOM classes,
  styles, datasets, and overflow behavior, and
  `ui/widgets/options/widgetPercentSizing.ts` owns percent-to-grid-unit sizing
  and delayed metric replay. Dynamic widget module URLs are resolved through
  `ui/widgets/rendering/widgetModulePaths.ts`; widget API action registration is
  owned by `ui/widgets/rendering/widgetEvents.ts`, while inline widget HTML
  sanitizing, CSS injection, and custom JS execution are owned by
  `ui/widgets/rendering/widgetInlineCode.ts`. Widget renderer content clearing,
  container setup, and form-control drag protection are owned by
  `ui/widgets/rendering/widgetShell.ts`. Dynamic widget import context handoff,
  blocked-path logging, and import errors are owned by
  `ui/widgets/rendering/widgetModuleRenderer.ts`. Only same-origin
  `/ui/widgets/plainspace/*` modules and documented `/widgets/{folder}/widget.js`
  community assets are importable. The Widget Manager validates community
  folder names before registering `/widgets/{folder}/widget.js` content paths.
  Editable widget elements use `ui/widgets/rendering/editableRegistration.ts`
  so public widgets do not import Designer bundles directly.
- `ui/widgets/panel/widgetControls.ts`, `ui/widgets/panel/widgetPanelAddWidget.ts`,
  `ui/widgets/panel/widgetPanelCatalog.ts`, and `ui/widgets/panel/widgetsPanel.ts`:
  TypeScript-authored dashboard widget panel chrome, add-widget pipeline,
  searchable widget catalog/cards, and remove/resize controls.
- `ui/widgets/plainspace/*`: active bundled PlainSpace widget implementation.
  Settings surfaces embed admin widget panels through a small canonical
  `/ui/widgets/plainspace/admin/*` allowlist rather than arbitrary import paths.
  Route-specific settings loads, saves, media picks, SEO values, and security
  page lists are owned by
  `ui/widgets/plainspace/admin/settings/settingsPanelsData.ts`.
  Basic public widgets `htmlWidget`, `textBoxWidget`, `mediaWidget`,
  `buttonWidget`, `navigationMenuWidget`, `breadcrumbWidget`, `galleryWidget`
  `collectionArchiveWidget` and their shared `publicWidgetHelpers` plus the admin widgets
  `accessSettingsWidget`, `activityLogWidget`, `designerLayoutsWidget`,
  `dragInfoWidget`, `fontsListWidget`, `layoutTemplatesWidget`,
  `loginStrategiesWidget`, `loginStrategyEditWidget`, `mediaExplorerWidget`,
  `modulesListWidget`, `permissionsWidget`, `roadmapIntroWidget`,
  `roadmapWidget`, `systemInfoWidget`, `systemSettingsWidget`,
  `userEditWidget`, `usersListWidget`, `widgetListWidget`,
  `defaultwidgets/contentSummaryWidget`, `defaultwidgets/pageStats`, and
  `defaultwidgets/pageList/pageList`, `defaultwidgets/pageList/pageService`,
  `pageEditorWidgets/pageContentWidget`, and
  `pageEditorWidgets/pageEditorWidget` are TypeScript-authored. Module list
  registry normalization, fetches, activation toggles, metadata formatting,
  and ZIP upload payloads are owned by
  `ui/widgets/plainspace/admin/modulesListData.ts`. Widget list
  registry/page-layout/template data normalization and fetching are owned by
  `ui/widgets/plainspace/admin/widgetListData.ts`. User list user/role
  normalization, fetches, and role/user mutation events are owned by
  `ui/widgets/plainspace/admin/usersListData.ts`. User edit profile
  normalization, detail fetches, profile update payloads, and delete actions
  are owned by `ui/widgets/plainspace/admin/userEditData.ts`. System settings
  fetches, page normalization, setting persistence, and favicon picker result
  handling are owned by `ui/widgets/plainspace/admin/systemSettingsData.ts`.
  Permission list normalization, fetching, and permission creation are owned by
  `ui/widgets/plainspace/admin/permissionsData.ts`, which delegates shared
  role actions through `ui/widgets/plainspace/admin/usersListData.ts`. Designer
  layout normalization, sorting, URLs, and list fetches are owned by
  `ui/widgets/plainspace/admin/designerLayoutsData.ts`; its user-facing links
  point to `/admin/studio/design` while the internal app remains `designer`.
  Font
  provider normalization, provider toggles, Google Fonts key persistence, and
  catalog refresh sequencing are owned by
  `ui/widgets/plainspace/admin/fontsListData.ts`. Login strategy
  normalization, admin-local filtering, and auth strategy toggles are owned by
  `ui/widgets/plainspace/admin/loginStrategiesData.ts`. Login strategy edit
  setting keys, value normalization, and settings persistence payloads are
  owned by `ui/widgets/plainspace/admin/loginStrategyEditData.ts`.
  Media explorer listing normalization, upload requests, folder creation, and
  share-link payloads delegate to `ui/shared/media/mediaLibraryData.ts` through
  the `ui/widgets/plainspace/admin/mediaExplorerData.ts` wrapper.
  Page editor page normalization, layout-template loading, update payloads, and
  page-data cache invalidation are owned by
  `ui/widgets/plainspace/admin/pageEditorWidgets/pageEditorData.ts`.
  Page content attachment normalization, Builder/Designer/MediaManager loads,
  HTML attachment paths/uploads, page update payloads, and cache invalidation
  are owned by
  `ui/widgets/plainspace/admin/pageEditorWidgets/pageContentData.ts`.
  Page statistics lane loading, payload construction, and summary counting are
  owned by `ui/widgets/plainspace/admin/defaultwidgets/pageStatsData.ts`.
  The Pages list owns its table hierarchy derivation in
  `ui/widgets/plainspace/admin/defaultwidgets/pageList/pageList.ts` so filtered
  child pages stay nested under visible parents instead of duplicating as
  top-level rows. Collections admin loading, parent/child derivation,
  layout/design indicators, and edit/open URLs are owned by
  `ui/widgets/plainspace/admin/defaultwidgets/collectionsList/collectionsListData.ts`.
  Content summary design/page loading, upload filtering, admin-token owner
  extraction, and draft-design creation payloads are owned by
  `ui/widgets/plainspace/admin/defaultwidgets/contentSummaryData.ts`.
  Access-control setting normalization, loading, and public-registration
  persistence are owned by `ui/widgets/plainspace/admin/accessSettingsData.ts`.
  Layout template normalization, public page usage mapping, template fetches,
  and blank template creation are owned by
  `ui/widgets/plainspace/admin/layoutTemplatesData.ts`.

## Public Entry Points

HTML shells and server-rendered app shells should load `/build/` bundles
directly. Static files such as theme assets may remain under `public/`, but
browser vendor libraries are owned from `ui/shared/vendor`. TypeScript sources
belong in `ui/` and are emitted through `/build` bundles or explicit runtime
transpiler routes. Direct `.ts` and `.tsx` requests on browser static mounts are
blocked.
Module `publicLoader.js`/`publicLoader.ts` files are browser modules too. They
may stay with their server module for ownership, but they must import shared UI
helpers from canonical `/ui/...` URLs, not from retired `/plainspace/...` or
`/assets/js/...` implementation paths. The emitted `.js` loader files are build artifacts; new
loader implementations should be TypeScript-authored beside them. Core module
public loaders are exposed through an explicit server allowlist of
`/mother/modules/<module>/publicLoader.js` routes; the `mother/` tree is not
served as a broad static directory. The public runtime mirrors this rule in
`ui/runtime/publicLoaderPaths.ts`: community loaders may be discovered from
`/modules/<module>/publicLoader.js`, while `/mother/modules/...` is generated
only for the named core public loaders.

The Jest suite includes `tests/uiArchitectureBoundaries.test.js` to keep these
boundaries from regressing: `apps/designer/` and `public/plainspace/` source
trees must not contain browser implementation scripts, public entry trees must
not contain TypeScript sources, module public loaders must use canonical UI imports, docs
must not point new UI work at retired implementation paths, and UI code must not
import retired public implementation paths. Runtime UI sources must not import
from `ui/shell`; Shell UI sources must not import Runtime, Designer, or Widgets.
Shared helpers belong in `ui/shared`. Widgets own their option and rendering
helpers and must not import Runtime, Shell, or Designer. Shared UI code must not
import feature zones.
Reusable helper roots under non-designer `ui/*/entries`,
`ui/runtime/envelope`, `ui/shared/agent`, `ui/shared/controls`, `ui/shared/dev`,
`ui/shared/dialogs`, `ui/shared/grid`, `ui/shared/icons`, `ui/shared/loaders`,
`ui/shared/media`, `ui/shared/sanitize`, `ui/shared/scripts`, `ui/shared/utils`,
`ui/widgets/options`, and `ui/widgets/rendering` plus the public runtime boot,
public loader path guard, runtime script, runtime scene helper, runtime grid
metrics helper, runtime canvas item helper, runtime DOM shell helper, runtime
design layout helper, runtime widget renderer helper, runtime widget instance
helper, runtime widget mounting helper, runtime page data helper, runtime
geometry, Shell page-data helper, and
the typed Shell helpers for app frames, login, login strategy display,
registration, first-install, install, media explorer, notifications, admin
search, user color, and selected PlainSpace widgets are TypeScript-authored; emitted
JavaScript is a build artifact beside the source.

Run `npm run verify:ui` from the repository root before changing UI module
boundaries. It runs the UI boundary/critical-path tests and then the browser
build.

## TypeScript Guardrails

`tsconfig.browser.json` typechecks the full `ui/**/*.ts` and
`ui/**/*.tsx` surface plus browser-facing module `publicLoader.ts` files. This
keeps new UI modules inside the same strict browser contract instead of relying
on hand-maintained file lists.

Some Designer files still carry explicit `@ts-nocheck` markers because
they were migrated from JavaScript before their DOM and layout contracts were
typed. Runtime, Shell, Widgets, and Shared UI TypeScript are checked strictly.
The boundary test pins the exact allowed suppression list so new UI TypeScript
cannot opt out silently.

## Migration Order

1. Move transport and contracts into `ui/shared`.
2. Move admin shell code behind shared API clients.
3. Move designer state and canvas modules into `ui/designer`.
4. Move public rendering into `ui/runtime` and keep the bundle lean.
5. Move widget definitions into `ui/widgets` with explicit capabilities.

This keeps current performance intact while making a later Go or Rust core
possible without rewriting the browser experience.
