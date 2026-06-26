# PlainSpace

## Boundaries

PlainSpace is a core layout and admin-surface module. Widgets provide renderable
blocks, apps provide isolated tools, and PlainSpace stores layout relationships
through its own event contract. The widget registry request requires a scoped
`plainspace` core payload; browser or app code reaches it through approved
runtime/app bridge paths rather than direct system events.

Seeds default admin pages and widgets and handles multi-viewport layouts used by the drag‑and‑drop builder.

## Startup
- Core module but tolerates being loaded as community for testing.
- Issues a public JWT for front-end widget registry requests.

## Purpose
- Seeds the admin dashboard pages on first run.
- Admin pages defined by community modules are automatically placed
  under `/admin/pages/{slug}` when seeded. Pages may provide a
  `parentSlug` to nest them under a workspace (for example
  `parentSlug: 'content'` and `slug: 'pages'` becomes `content/pages`).
  Use `/` in `parentSlug` for deeper nesting, e.g.,
  `parentSlug: 'settings/users-access'` with `slug: 'edit'` yields
  `settings/users-access/edit`.
  Icons set in `config.icon` are copied to `meta.icon` during seeding and
  used by the dashboard navigation; if `meta.icon` is missing the
  navigator falls back to `config.icon`.
- Seed pages can define their dashboard shell through `config.layout`; the
  seeder copies that object to `meta.layout` for new and existing seed pages.
  Use `layout.sidebar: 'empty-sidebar'` for detail/editor pages such as the
  built-in Page Editor where the workspace sidebar would waste space.
- Settings now use dedicated surfaces (`/settings/general`, `/settings/design`, `/settings/seo`, `/settings/security`, `/settings/modules`, `/settings/users-access`, `/settings/import-export`) rendered as tabbed forms/panels instead of widget grid metadata.
- Provides `widget.registry.request.v1` for the page builder.
- The widget registry validates stored browser URLs against their real static
  roots: `/ui/widgets/plainspace/*` maps to bundled UI widgets,
  `/widgets/*` maps to community widgets, and `/plainspace/widgets/*` remains a
  legacy compatibility path.
- Runtime widget module failures render inline diagnostic codes instead of
  leaving dashboard cards as blank white panels.
- Runtime grids mount layout and widget placeholders first, then hydrate widget
  imports, default instance options and data work in a second stage so layout
  does not wait for widget code.
- Widget definitions may expose a `layout` or `metadata.layout` size contract
  with named `supportedSlots`, breakpoint slot lists and a `heightMode`. The
  runtime records the resolved slot on the canvas item; unsupported declared
  slots are marked with `WIDGET_SIZE_UNSUPPORTED` for editor/debug surfaces.
- The `full` slot means a widget owns the full dashboard row/area. Runtime
  layout treats that area as exclusive for overlap resolution and disables
  inner widget scrollbars so the surrounding page/grid owns scrolling.
- Existing default widget seed options (`halfWidth`, `thirdWidth` and
  `overflow`) are published into the registry as `metadata.layout`, preserving
  old seeds while giving the editor/runtime an explicit size contract.
- `seedAdminWidget` can attach width and height options when creating admin widgets.
- When seeding layout options without a `height`, a default of 40% is applied so
  widgets occupy space without overlap. If no layout options are provided and an
  instance already exists, its stored size is preserved. Seeded layouts now pack
  widgets into deterministic rows using the supplied width metadata, so half-width
  widgets land side-by-side (0% / 50%) and thirds land in columns (0% / 33.333% /
  66.666%). When no width metadata is present a widget spans the full row.
- Default admin widgets are seeded with options describing their suggested layout.
- The Home workspace now seeds widgets that highlight what's coming next and a draggable demo.

- Widgets can be marked as **global** in the builder. A global widget shares its
  `instanceId` across pages so editing it updates every occurrence.

## Listened Events
- `widget.registry.request.v1`
- `getLayoutForViewport`
- `getAllLayoutsForPage`
- `saveLayoutForViewport`
- `getLayoutTemplate`
- `getLayoutTemplateNames`
- `saveLayoutTemplate`
- `deleteLayoutTemplate`
- `getGlobalLayoutTemplate`
- `setGlobalLayoutTemplate`
- `getWidgetInstance`
- `saveWidgetInstance`
- `getPublishedDesignMeta`
- `savePublishedDesignMeta`

These raw events are internal bus contracts. Browser HTTP callers should use
`cmsAdminApiRequest` with the `plainSpace` resource, and iframe apps get only
the app-origin read actions unless they are a core-owned app with an explicit
manifest bridge.

Every PlainSpace event requires a scoped payload with `jwt`,
`moduleName: "plainspace"` and `moduleType: "core"`. The module forwards all
database work with the same fixed core scope; callers can query layouts,
templates and widget metadata only through the runtime/admin facades, not by
impersonating another module on the raw event bus.

### Seeding Widgets with Layout Options

The helper `seedAdminWidget(motherEmitter, jwt, widgetData, options)` creates an
admin lane widget if it does not already exist and stores layout options in the
`widget_instances` table. The `options` object supports the following keys:

- `max` – applies both `max-width` and `max-height` using a percentage value (number or string).
- `maxWidth` – percentage value for the maximum width (number or string).
- `maxHeight` – percentage value for the maximum height (number or string).
- `halfWidth` – if `true` the widget should use at least half of the desktop width.
- `thirdWidth` – if `true` the widget should use at least one third of the width.
- `width` – custom width percentage.
- `height` – custom height hint. Values from 1 to 100 are treated as
  percentages; values above 100 are treated as fixed grid-pixel rows so compact
  admin widgets such as `height: 160` do not expand to `160%` of the viewport.
  If omitted, a default of 40% is used so seeded widgets occupy space.
- `xPercent`/`yPercent` are automatically derived from the hints above during
  seeding and saved together with grid `x`/`y`/`w`/`h` so the client can render
  the layout without running collision correction.
- Full-slot widgets ignore inner overflow scrolling and use page-level
  scrolling instead.
- Full-only widget contracts are normalized to the grid width before slot
  validation, so legacy `w=8` layouts still render as full-width widgets.
- `overflow` – when `true` the widget height is fixed and may scroll; when
  `false` the widget expands to fit its content.

Example seed entry specifying a compact 160px widget height:

Widget `content` values are browser URLs. New seeds should use
`/ui/widgets/plainspace/*`. The active bundled widget source lives under
`ui/widgets/plainspace/`; the `/plainspace/widgets/*` URLs are
compatibility shims for existing content and are normalized to canonical
`/ui/widgets/plainspace/*` module URLs by the runtime import guard.

The default Media page seeds `mediaExplorer` as a full-width admin widget. The
widget itself is only a PlainSpace mount point; folder browsing, upload,
share-link creation, rename and delete are provided by the shared Explorer
surface in `ui/shared/media/` so the shell picker and global media modal can
reuse the same Media Manager integration.

```json
{
  "adminWidgets": [
    {
      "widgetId": "designerDemo",
      "widgetType": "admin",
      "label": "Designer Demo",
      "content": "/ui/widgets/plainspace/admin/dragInfoWidget.js",
      "category": "core",
      "options": { "height": 160 }
    }
  ]
}
```

Seed files run without validation; only load admin seeds from trusted modules.
CanvasGrid recalculates widget hitboxes and bounding boxes on first render,
so seeding the `height` option is sufficient – no extra size data is needed.

Enable debug logging for option calculations by seeding `debug: true`:

```json
{
  "options": { "height": 160, "debug": true }
}
```
The front-end console will show grid dimensions and the resulting update
payload, helping diagnose why a widget renders at a different size than
expected.

Saved options can be read later with `getWidgetInstance` to decide how the
widget should render in the builder.
