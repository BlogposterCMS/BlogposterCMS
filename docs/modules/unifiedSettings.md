# Unified Settings

## Boundaries

Unified Settings owns schema registration and module-scoped settings bundles.
Core modules may register and update their own namespace. Cross-module setting
management is reserved for the `unifiedSettings` core identity through the
admin facade. Apps and widgets consume schema/value bundles through Runtime
Manager rather than mutating another module's namespace directly.

Provides the registry layer for module-contributed settings schemas and routes
setting values through `settingsManager`. This gives the admin UI one stable
contract for schema metadata plus stored values.

## Startup
- Core module loaded with a JWT.
- Runtime registry is in memory; setting values persist through Settings Manager.

## Purpose
- Registers module settings schemas and individual settings sections.
- Reads schema metadata, registered modules and schema lists.
- Reads, updates, bulk-updates and deletes module-scoped setting values.
- Provides a bundle event that returns `{ moduleName, schema, settings }` for
  admin screens.

## Listened Events
- `registerModuleSettingsSchema`
- `registerSettingsSection`
- `getModuleSettingsSchema`
- `listModuleSettingsSchemas`
- `listRegisteredSettingsModules`
- `getModuleSettingValue`
- `listModuleSettings`
- `getModuleSettings`
- `updateModuleSettingValue`
- `updateModuleSettings`
- `deleteModuleSetting`

Module values are stored under keys like `seoManager.titleTemplate` through
`settingsManager`; JSON values are serialized on write and parsed on read.
Schema editing requires `settings.unified.editSchemas`, reads require
`settings.unified.viewSettings`, and value updates require
`settings.unified.editSettings`.

Core modules may self-register and update only their own settings namespace.
Only `moduleName: "unifiedSettings"` with `moduleType: "core"` may pass an
explicit `targetModule` to manage another module's settings through the admin
facade.
