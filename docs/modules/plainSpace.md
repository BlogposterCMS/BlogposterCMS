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
  and `/widgets/*` maps to community widgets.
- Runtime widget module failures render inline diagnostic codes instead of
  leaving dashboard cards as blank white panels.
- Runtime grids mount layout and widget placeholders first, then hydrate widget
  imports, default instance options and data work in a second stage so layout
  does not wait for widget code.
- Widget definitions may expose a `layout` or `metadata.layout` size contract
  with named `supportedSlots`, breakpoint slot lists, a `defaultSlot`, and a
  `heightMode` plus optional viewport-aware height policy. The dashboard
  runtime resolves these contracts to fixed flow slots: `third`, `half`,
  `twoThird`, `full`, or `page`.
- Dashboard layouts are stored as `{ widgetId, slot, column, order }` entries.
  The widget owns the supported size, while the user owns the raster placement.
  The dashboard no longer derives sizing from widget-instance width/height hints
  or absolute pixel placement.
- Dashboard edit drag-and-drop uses a live flow placeholder. Existing widgets
  move to the previewed placeholder on drop, and new widgets from the drawer can
  be inserted before the next dashboard instance instead of being appended. A
  pointer-driven widget preview follows the cursor while a snap pulse exposes
  the active grid column without reintroducing free CanvasGrid positioning.
- Widget height is owned by the registry contract too. A layout can declare
  `heightMode: 'dynamic' | 'auto' | 'scroll' | 'fixed'` and a `height` object
  with `minHeight`, `height`, `maxHeight`, `viewports`, or `heights` overrides.
  Viewport values cascade mobile -> tablet -> desktop, so a widget can set the
  smallest readable height once and override only where a larger viewport needs
  more space.
- The `page` slot is exclusive: if a page-sized admin tool is present, it owns
  the dashboard surface by itself. Use it for full-page workspaces such as Media
  Explorer or Navigation Studio.
- `seedAdminWidget` strips layout keys from module seed defaults. Layout belongs
  in registry metadata and page `widgetSlots`, while widget instances store only
  real render defaults.
- Admin dashboard hydration does not apply widget-instance layout
  options. Percent sizing through `applyWidgetOptions` remains available to
  CanvasGrid-style public/runtime surfaces, while dashboard admin placement and
  height come only from the registry contract.
- Default admin widgets are seeded with explicit metadata contracts and page
  `widgetSlots`.
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

### Seeding Widgets with Dashboard Slots

The helper `seedAdminWidget(motherEmitter, jwt, widgetData, options)` creates a
widget row if it does not already exist. Dashboard sizing is not read from
`options`; layout keys such as `halfWidth`, `thirdWidth`, `width`, `height` and
`overflow` are stripped before optional default widget data is stored.

Built-in widgets declare their allowed dashboard sizes in `metadata.layout`:

```js
metadata: {
  layout: {
    defaultSlot: 'half',
    supportedSlots: [
      { name: 'half', minCols: 6, maxCols: 6 },
      { name: 'full', minCols: 12, maxCols: 12 }
    ],
    breakpoints: {
      mobile: ['full'],
      tablet: ['half', 'full'],
      desktop: ['half', 'full']
    },
    heightMode: 'dynamic',
    height: {
      mode: 'dynamic',
      minHeight: {
        mobile: 160,
        tablet: 180,
        desktop: 220
      }
    }
  }
}
```

Seed pages choose where each widget may start with `config.widgetSlots`:

```js
config: {
  widgets: ['pageList', 'pageStats'],
  widgetSlots: {
    pageList: 'twoThird',
    pageStats: 'third'
  }
}
```

Widget `content` values are browser URLs. New seeds should use
`/ui/widgets/plainspace/*`. The active bundled widget source lives under
`ui/widgets/plainspace/`; community widgets use `/widgets/{folder}/widget.js`.

The default Media page seeds `mediaExplorer` as a page-slot admin widget. The
widget itself is only a PlainSpace mount point; folder browsing, upload,
share-link creation, rename and delete are provided by the shared Explorer
surface in `ui/shared/media/` so the shell picker and global media modal can
reuse the same Media Manager integration.

Seed files run without validation; only load admin seeds from trusted modules.
Community seeds that need default render data can still pass non-layout
`options`; saved options can be read later with `getWidgetInstance`.
