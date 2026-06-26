# dummyModule

## Boundaries

`dummyModule` is intentionally a community module. It runs through Module
Loader's scoped `moduleHost`, receives no raw Express app and cannot reach raw
database, filesystem, network or process APIs. It may emit only allowed,
module-scoped events, and payload identity is stamped by the host rather than
trusted from module code.

The `dummyModule` is a minimal no-UI community module used as a learning
template. It demonstrates the current add-on boundary: modules add backend
capability contracts, widgets render UI blocks and apps provide isolated admin
or tool surfaces.

## Startup
- Loaded from `modules/dummyModule` when present.
- Exports `initialize({ motherEmitter, moduleHost, jwt, nonce })`.
- Receives a scoped event bus from Module Loader; emitted payloads are stamped
  with the module identity and token by the host.

## Purpose
- Emits a safe `dummyModule.ready` event during startup so health checks can
  verify that the module uses the scoped event bus.
- Listens for `dummyModule.pagePublished` and logs sanitized page metadata.
- Listens for the module-owned `dummyModule.dummyAction` event and returns a
  simple response.

## Listened Events
- `dummyModule.pagePublished`
- `dummyModule.dummyAction`

## Security Notes
- Does not call raw database events, raw SQL placeholders, registry events or
  direct system mutation events.
- Does not receive the raw Express app.
- Does not declare external services by default; add them deliberately in
  `apiDefinition.json` only when a real module contract needs them.

Use this module as a starting point for backend capability experiments. Keep
state changes behind core contracts instead of reaching into database or system
events directly.
