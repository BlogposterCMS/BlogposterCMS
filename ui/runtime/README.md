# Runtime

Target home for public page rendering.

This zone must remain small: page data in, theme and widgets activated, no
shell or designer dependencies. Shared helpers, including partial loading and
script execution, belong in `ui/shared`; reusable widget behavior belongs in
`ui/widgets`.

Runtime code should keep concrete dynamic edges behind small gateways:

- Browser-side public runtime loaders must read core data through
  `cmsPublicRuntimeRequest` resource/action facades. They must not call direct
  internal events such as `getEnvelope`, `designer.getLayout` or `getWidgets`
  through `/api/meltdown`.
- Public Design Studio/widget rendering should use the widget loader's static
  public canvas for saved percent bounds and responsive stacking. Editor-only
  canvas controls, zoom state and DOM scraping must not be required to verify a
  public page preview.
- After the public widget loader finishes rendering a page design it sets
  `document.documentElement.dataset.bpPublicWidgetsReady = "true"` and emits
  `bp:public-widgets-ready` with the `layoutRef` and rendered widget count.
  Agent/browser checks should wait for this signal before comparing screenshots
  or bounds.
- `publicLoaderImporter.ts` owns module public-loader discovery/import.
- `envelope/orchestrator.ts` passes one mutable page runtime context through
  ordered public loaders so a blocking design loader can hand the current page
  layout to the widget loader without persistent global state.
- `main/runtimeAdminGrid.ts` owns admin dashboard grid setup, attached content,
  and admin grid persistence orchestration.
- `main/runtimeAdminGridInteractions.ts` owns admin grid browser interactions,
  responsive columns, window globals, drop placement, and layout persistence.
- `main/runtimeAdminGridMounting.ts` owns admin canvas item creation,
  projected widget placement, instance metadata mapping, and admin widget
  mounting.
- `main/runtimePageContext.ts` owns browser route context, admin page title
  updates, and the runtime widget registry global. Explicit navigation
  pathnames must win over the boot `PAGE_SLUG` so content-only admin
  navigation cannot reuse stale page state.
- `main/sceneRuntime.ts` owns renderer scene metadata and appearance.
- `main/runtimeSceneEffects.ts` owns runtime scroll/motion effect binding and
  animation-frame updates.
- `main/runtimeCanvasItems.ts` owns canvas item wrapper construction,
  placeholders, mounted content nodes, layout rect projection, and layout
  metadata application.
- `main/runtimeCanvasSerialization.ts` owns runtime canvas item/layout
  serialization for persistence.
- `main/runtimeContentFallbacks.ts` owns sanitized runtime HTML insertion and
  empty-state DOM fallbacks.
- `main/runtimeDesignLayouts.ts` owns design widget normalization and safe
  design surface styling for runtime rendering.
- `main/runtimeGridMetrics.ts` owns renderer grid size and static grid scaling
  calculations.
- `main/runtimeGridWidgetMounting.ts` owns runtime grid layout item projection,
  widget lookup, canvas item mounting, and widget render dispatch.
- `main/runtimeAttachedContent.ts` owns attached content discovery, child page
  rendering, and attached design/layout/HTML fallbacks.
- `main/runtimePageComposition.ts` owns public runtime page composition,
  static grid mounting, and fallback selection.
- `main/runtimePresentationCascade.ts` owns parent-page presentation inheritance
  for public pages so children can reuse the nearest ancestor design or layout
  template without adding a taxonomy-style template system.
- `main/runtimePageShell.ts` owns renderer DOM shell, global style, and URL
  sanitizing helpers.
- `main/runtimeShellPartials.ts` owns shell partial fetching, sanitized
  hydration, partial fallback, and load events.
- `main/runtimeStaticGrid.ts` owns public/static runtime grid creation,
  metrics selection, and grid widget mounting orchestration.
- `main/runtimePageDataHelpers.ts` owns runtime data auth payloads, response
  normalization, data unwrapping, and widget lane resolution.
- `main/runtimePageData.ts` owns page/layout/widget/design runtime event request
  helpers.
- `main/runtimeWidgetEvents.ts` owns widget API-event registration and
  debounced runtime event batching.
- `main/runtimeWidgetContext.ts` owns runtime widget context construction,
  scene dataset extraction, and admin-token exposure.
- `main/runtimeWidgetInlineCode.ts` owns inline widget HTML sanitizing, CSS
  injection, and custom JS execution.
- `main/runtimeWidgetModuleRenderer.ts` owns guarded dynamic widget module
  loading, blocked-path logging, runtime context handoff, and import errors.
- `main/runtimeWidgetShell.ts` owns the runtime widget shadow root, global CSS
  import, container setup, form-control drag guard, and resize handle slot.
- `main/runtimeWidgetRenderer.ts` owns widget shell/event setup and dispatches
  inline code or dynamic module rendering.
- `main/runtimeWidgetInstances.ts` owns default widget instance option loading
  and application.
- `main/runtimeWidgetMounting.ts` owns the per-item mount pipeline that applies
  default options, renders widget code, and completes runtime hydration state.
- `main/runtimeWidgetHydration.ts` owns the staged widget shell lifecycle:
  layout placeholders are marked as `shell`, widget imports/data start after a
  paint opportunity, and completed widgets become `ready` or `failed`.
- `main/widgetRuntimeGateway.ts` is the page renderer's widget-facing surface.
- `main/adminWidgetSurfaces.ts` owns admin-only widget surface imports.

Bundle entry files under `entries/` own browser boot side effects. Importable
runtime modules should export boot functions or helpers without auto-starting.
