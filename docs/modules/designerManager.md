# designerManager

`designerManager` is the core owner for Designer persistence, layout documents
and public Design loader contracts. It exposes the canonical `designer.*`
events through Runtime Manager facades; Designer is not an optional community
module.

## Startup

- Loaded as `mother/modules/designerManager` during server startup.
- Requires `isCore: true`, a core JWT and `motherEmitter`.
- Registers `designerManager` as the loaded core service.
- Initializes Designer schema, placeholders and service handlers from
  `mother/modules/designerManager`.
- Keeps placeholder dispatch inside the core service boundary.

## Purpose

- Keeps Designer persistence behind a core-owned backend contract.
- Owns `designer.saveDesign`, `designer.getDesign`, `designer.listDesigns`,
  `designer.getLayout` and `designer.listLayouts`.
- Prevents optional module management from installing or spoofing the Designer
  service name.

## Boundaries

`designerManager` is not an app, widget or optional module. Apps and widgets
should not import it directly; they should use the AppLoader bridge, Runtime
Manager facade or public runtime contracts documented in `designer.md`.

The manager intentionally keeps the public resource name `designer` while the
server startup owner remains `designerManager`. Community modules cannot
install, uninstall, activate or spoof the core-owned Designer service through
module management APIs.
