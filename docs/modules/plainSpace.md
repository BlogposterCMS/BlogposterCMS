# PlainSpace

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
  `parentSlug: 'settings/users'` with `slug: 'edit'` yields
  `settings/users/edit`.
  Icons set in `config.icon` are copied to `meta.icon` during seeding and
  used by the dashboard navigation; if `meta.icon` is missing the
  navigator falls back to `config.icon`.
- Provides `widget.registry.request.v1` for the page builder.
- `seedAdminWidget` can attach width and height options when creating admin widgets.
- When seeding layout options without a `height`, a default of 40% is applied so
  widgets occupy space without overlap. If no layout options are provided and an
  instance already exists, its stored size is preserved.
- Default admin widgets are seeded with options describing their suggested layout.
- The Home workspace now seeds widgets that highlight what's coming next and a draggable demo.

- Widgets can be marked as **global** in the builder. A global widget shares its
  `instanceId` across pages so editing it updates every occurrence.

## Listened Events
- `widget.registry.request.v1`

This module demonstrates how non-critical features can still benefit from token verification before accessing core services.

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
- `height` – custom height percentage. If omitted, a default of 40% is used so
  seeded widgets occupy space.
- `overflow` – when `true` the widget height is fixed and may scroll; when
  `false` the widget expands to fit its content.

Saved options can be read later with `getWidgetInstance` to decide how the
widget should render in the builder.
