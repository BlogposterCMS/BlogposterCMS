# designerManager

`designerManager` is a core adapter for the legacy `modules/designer` backend.
It exists so the first-party Designer app can keep its historical
`designer.*` event names while the optional Module Loader treats the
`modules/designer` folder as core-owned instead of as a community module.

## Startup

- Loaded as `mother/modules/designerManager` during server startup.
- Requires `isCore: true`, a core JWT and `motherEmitter`.
- Registers the legacy module identity `designer` as `moduleType: "core"`.
- Delegates initialization to `modules/designer` with `moduleType: "core"`.
- Stores the legacy service in `global.loadedModules.designer` for existing
  database placeholder dispatch.

## Purpose

- Keeps Designer persistence behind a core-owned backend contract.
- Preserves compatibility for `designer.saveDesign`, `designer.getDesign`,
  `designer.listDesigns`, `designer.getLayout` and `designer.listLayouts`.
- Prevents the optional module loader from treating `modules/designer` as a
  user-managed community module.

## Boundaries

`designerManager` is not an app, widget or optional module. It is the ownership
shim for the legacy Designer backend. Apps and widgets should not import it or
the legacy service directly; they should use the AppLoader bridge, Runtime
Manager facade or public runtime contracts documented in `designer.md`.

The manager intentionally registers only the `designer` legacy identity with
the event bus. This keeps database and placeholder calls aligned with the
historical `designer` schema while still making the server startup owner
explicit. Community modules cannot install, uninstall, activate or spoof the
core-owned `designer` folder through module management APIs.
