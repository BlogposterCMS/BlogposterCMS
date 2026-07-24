# Color Library

## Boundaries

`colorLibrary` is the core owner of Color Scheme persistence, validation and
activation. Builder apps, widgets and public renderers use the Runtime Manager
facade and shared browser client; they do not read Settings Manager keys or emit
raw Color Library events directly. The module owns no widget, page, theme,
Designer-only API or public asset route.

See [Color Schemes](../color-library.md) for the numbered Default-slot model,
runtime tokens, direct overrides and migration contract.

## Events

- `colorLibrary.list`
- `colorLibrary.getPublic`
- `colorLibrary.create`
- `colorLibrary.update`
- `colorLibrary.delete`
- `colorLibrary.createScheme`
- `colorLibrary.updateScheme`
- `colorLibrary.activateScheme`
- `colorLibrary.deleteScheme`

Admin reads require `builder.use`; mutations require `builder.publish`. Public
reads return only the active scheme.
