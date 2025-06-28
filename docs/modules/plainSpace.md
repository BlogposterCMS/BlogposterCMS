# PlainSpace

Seeds default admin pages and widgets and handles multi-viewport layouts used by the drag‑and‑drop builder.

## Startup
- Core module but tolerates being loaded as community for testing.
- Issues a public JWT for front-end widget registry requests.

## Purpose
- Seeds the admin dashboard pages on first run.
- Admin pages defined by community modules are automatically placed
  under `/admin/pages/{slug}` when seeded.
- Provides `widget.registry.request.v1` for the page builder.
- `seedAdminWidget` can attach width and height options when creating admin widgets.
- Default admin widgets are seeded with options describing their suggested layout.

- Widgets can be marked as **global** in the builder. A global widget shares its
  `instanceId` across pages so editing it updates every occurrence.

## Listened Events
- `widget.registry.request.v1`

This module demonstrates how non-critical features can still benefit from token verification before accessing core services.

### Seeding Widgets with Layout Options

The helper `seedAdminWidget(motherEmitter, jwt, widgetData, options)` creates an
admin lane widget if it does not already exist and stores layout options in the
`widget_instances` table. The `options` object supports the following keys:

- `max` – applies both `max-width` and `max-height` using percentage values.
- `maxWidth` – percentage value for the maximum width.
- `maxHeight` – percentage value for the maximum height.
- `halfWidth` – if `true` the widget should use at least half of the desktop width.
- `thirdWidth` – if `true` the widget should use at least one third of the width.
- `width` – custom width percentage.
- `height` – custom height percentage.
- `overflow` – when `true` the widget height is fixed and may scroll; when
  `false` the widget expands to fit its content.

Saved options can be read later with `getWidgetInstance` to decide how the
widget should render in the builder.
