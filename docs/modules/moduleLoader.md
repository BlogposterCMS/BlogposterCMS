# Module Loader

Loads optional community modules from the top-level `modules/` directory. Each
module is loaded, health-checked and registry-activated through the same
sandbox to prevent crashes or unsafe behaviour. The sandbox uses Node's `vm`
module and exposes only a few built-ins (`path`, scoped read-only `fs`,
`crypto`) plus `__dirname` and `__filename`.

During sandbox execution `process.env` is empty by default. A module only
receives service-specific environment values when it declares the matching
service in `apiDefinition.json`: `openai` maps to `OPENAI_API_KEY`, `grok` to
`GROK_API_KEY`, `xai` to `XAI_API_KEY`, `brave` to `BRAVE_API_KEY` and `news`
to `NEWS_MODEL`.

## Startup
- Core module executed after the initial core modules are ready.
- Requires a valid JWT to register modules in the database registry.

## Purpose
- Maintains a registry of installed modules.
- Loads modules and retries failed ones automatically.
- Passes community modules a scoped `moduleHost` and event bus instead of the
  raw Express app.
- Allows community modules to emit only module-owned query/lifecycle signals,
  `dbSelect` reads against module-owned tables, or documented public query
  contracts. A query-looking name such as `getContentEntry` is not enough to
  reach into a core module.
- Blocks sensitive read/query events such as users, roles, permissions, global
  settings, module/app registries, login strategies, importers and exporters.
  Community modules should use public runtime contracts or module-owned data
  instead of asking core system inventories directly.
- Allows listeners only on module-owned event names such as
  `<moduleName>.getItems`. It prevents subscribing to system or foreign events,
  counting their listeners, overriding the loader-issued token/nonce, using raw
  SQL placeholders, or querying tables that do not belong to the module.
- The database boundary repeats the same policy: community modules cannot write
  through `dbInsert`, `dbUpdate`, `dbDelete`, cannot call `performDbOperation`
  directly, cannot use raw SQL reads, and cannot turn themselves into
  `moduleType: "core"` through the payload.
- Runs local module `require("./...")` files inside the same sandbox and exposes
  a scoped read-only `fs` facade, so module code can read its own files but
  cannot read or write host files outside the module folder.
- Denies host process imports such as `child_process`, raw `http`/`https`
  clients and arbitrary npm packages. `ALLOW_INDIVIDUAL_SANDBOX=false` is
  ignored; community modules always execute through the sandbox and must ask
  audited core contracts for system actions.
- Disables dynamic code generation and blocks common VM escape patterns such as
  `eval`, `Function`, dynamic `import()` and `constructor.constructor`.
  Runtime facades such as `moduleHost`, `eventBus`, `app`, `path`, `fs`,
  `crypto`, timers and `console` are hardened so community code cannot climb
  from a facade method back to host `process`.
- The scoped `fs` facade is intentionally text/read-only. Binary reads,
  streams and `fs.promises` are unavailable because they would expose host
  objects; modules should read their own text/JSON assets with an explicit
  encoding and use core contracts for everything else.
- Static asset registration is bounded by both URL and filesystem checks:
  mount paths always stay under `/modules/<moduleName>`, traversal segments are
  rejected, the target directory must exist, real paths must remain inside the
  module folder and dotfiles are ignored by the static server. The static
  middleware also refuses raw TypeScript, `.env*`, package manifests and
  dependency lockfiles before Express can serve them. Community modules may
  pass only inert cache/index/extension options; callback options such as
  `setHeaders` are refused so module code never receives host Express objects.
- Legacy `grapesComponent` frontends are mounted through the same static asset
  checks as `moduleHost.registerStaticAssets()`: module names are sanitized,
  the module folder shape is revalidated, and `frontend/` must resolve inside
  the module folder.
- Skips core-owned legacy folders such as `modules/designer`; those backends are
  initialized by their core service instead of as community modules.
- Core-owned module names are shared ownership policy. They cannot be installed,
  activated, deactivated or uninstalled through module management APIs; they are
  updated with the application release path.
- Rejects module folders that contain `app.json`, `widgetInfo.json`, nested
  `moduleInfo.json`, `node_modules`, root host folders such as `apps/`,
  `widgets/`, `ui/`, `mother/` or `public/`, symlinks or junctions. Apps
  belong under `apps/`, widgets belong under `widgets/`, and each module folder
  owns exactly one module manifest even if somebody copies files directly into
  `modules/`.
- Uses a fresh module instance for runtime initialization after the health check
  succeeds.
- Uses the same sandbox, scoped `moduleHost` and event bus when a module is
  activated immediately through `activateModuleInRegistry`, so registry
  activation cannot bypass runtime boundaries.
- `deactivateModuleInRegistry` removes runtime listeners and clears
  `global.loadedModules` for the module, so inactive modules cannot keep
  handling events after the registry flag changes.
- Module uninstall uses the same runtime cleanup and sanitizes the module name
  before registry, database or filesystem changes. Folder deletion is bounded to
  the configured `modules/` root.
- Serves front-end assets for legacy GrapesJS modules when present, without
  bypassing module static-asset boundaries.
- Emits system notifications via a safe wrapper that falls back to
  `console.error` if the emitter is unavailable and deactivates modules when
  initialization fails, so broken modules never appear as loaded.
- Registers each successfully loaded module in `global.loadedModules` so
  database placeholders can invoke module-defined transactions.

## Listened Events
- `getModuleRegistry`
- `listActiveGrapesModules`
- `activateModuleInRegistry`

Every module folder must export an `initialize` function and include
`moduleInfo.json` with metadata. Directly copied module folders are validated
the same way as uploaded ZIPs: `moduleInfo.moduleName` must match the folder
name, may contain only letters, numbers, underscores and hyphens,
`moduleInfo.moduleType` must be omitted or set to `community`, and a missing or
malformed `moduleInfo.json` keeps the module inactive.
Community module metadata cannot declare app identity fields (`appName`,
`appType`) or widget identity fields (`widgetId`, `widgetType`); apps and
widgets use their own loaders and registries.

At runtime, `initialize` receives `{ motherEmitter, eventBus, moduleHost,
moduleInfo }`. For community modules, `motherEmitter` and `eventBus` are scoped
facades that keep the loader token/nonce internal, inject the module identity
into outbound events, prevent emitting as another module, refuse
`moduleType: "core"`, allow only module-owned query names such as
`<moduleName>.getItems`, module-owned lifecycle signals and `dbSelect` against
owned tables, allow listeners only for module-owned event names, block
listener-count introspection for system/foreign events, deny token/nonce
overrides, hide injected token fields from community listener callbacks, deny
raw SQL placeholders and restrict `dbSelect` to
module-owned table prefixes such as
`<moduleName>_*` or `community_<moduleName>_*`.
They also block direct `requestDependency` emissions; dependency loading remains
behind the registered `dependencyLoader` contract.
`moduleHost.registerStaticAssets({ dir, mountPath })` is the supported way to
publish module-owned static files. The `dir` must resolve to a real directory
inside the module folder, including after symlink resolution.

Direct Express access is not available to community modules. The
`ALLOW_COMMUNITY_APP_ACCESS` environment variable is ignored if present; use
`moduleHost.registerStaticAssets()` for module-owned assets or a core module
contract for backend behavior.

## Boundaries

The intended add-on vocabulary is strict:

- modules add backend capability contracts
- widgets render UI blocks
- apps provide isolated admin/tool surfaces

Widgets and apps should query the CMS through public APIs, shared UI clients or
the `runtimeManager` admin facade instead of reaching into server internals.

If a module folder lacks `index.js`, the loader emits a system-level error
notification and disables the module so it cannot be activated accidentally.

## Module Uploads

Administrators can install additional modules through the admin interface. The
upload button in the Modules page header accepts a single ZIP archive. For
security reasons the archive is validated before activation.

The ZIP must contain one module folder with at least these files:

1. **index.js** - entry point exporting an `initialize` function.
2. **moduleInfo.json** - metadata describing the module. It must contain
   `moduleName`, `version`, `developer` and `description` so the system can
   track updates and authorship.

The folder name must match `moduleInfo.moduleName`, and the ZIP may contain
exactly one `moduleInfo.json`. A community module manifest cannot claim
`moduleType: "core"` or app/widget identity. Core-owned names such as
`designer` cannot be installed as community modules.

Optional files such as `apiDefinition.json` or a `frontend/` folder may be
included. Module ZIPs and unpacked module folders cannot contain app manifests
(`app.json`), widget manifests (`widgetInfo.json`), nested module manifests,
top-level host folders such as `apps/`, `widgets/`, `ui/`, `mother/` or
`public/`, `node_modules`, package manifests/lockfiles, `.env*`, `.npmrc`,
`.yarnrc`, path traversal entries, symlinks or junctions. Apps and widgets must
use their own loaders, not be bundled inside modules, and community modules
cannot bring their own package-manager runtime.

Uploaded modules run in a sandbox and lack network access unless explicitly
allowed. Always review third-party code before installing it.
