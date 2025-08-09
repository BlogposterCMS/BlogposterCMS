# Widget Manager

Stores widgets used by both the public site and the admin dashboard.

## Startup
- Core module; creates `widgets_public` and `widgets_admin` tables.
- Automatically registers widgets found under `widgets`.

## Purpose
- CRUD events for widgets.
- Allows saving page layouts via `saveLayout.v1`.

## Listened Events
- `createWidget`
- `getWidgets`
- `updateWidget`
- `deleteWidget`
- `saveLayout.v1`

Widget operations enforce permissions, ensuring admin widgets are not accessible to the public lane.
