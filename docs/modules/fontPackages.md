# Font Packages

## Boundaries

`fontPackages` is the core owner of semantic typography package persistence,
validation and activation. Builder apps, widgets and public renderers use the
Runtime Manager facade and shared browser client; they do not read Settings
Manager keys or emit raw Font Package events directly. Raw font resources
remain owned by `fontsManager`, and colors remain owned by `colorLibrary`.

The `fontPackages` core module stores named semantic typography packages and the
active package id through the existing Settings Manager boundary.

See [Font Packages](../font-packages.md) for the data model, Runtime Manager
actions, public CSS behavior, Designer UI and direct-override semantics.

The module listens to:

- `fontPackages.list`
- `fontPackages.getPublic`
- `fontPackages.create`
- `fontPackages.update`
- `fontPackages.updateRole`
- `fontPackages.resetRole`
- `fontPackages.activate`
- `fontPackages.delete`

Admin reads require `builder.use`; mutations require `builder.publish`. Public
reads return only the active package.
