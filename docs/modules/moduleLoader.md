# Module Loader

Loads optional community modules from the top-level `modules/` directory. Each
community module is validated, health-checked in a short-lived runner process,
then started in a fresh runtime runner process if the health check succeeds.
Community module code is never required into the CMS host process.

The runner boundary is intentionally process-based and language-neutral. The
CMS host owns the event bus, static mounts, tokens, permissions and database
contracts; the module process can only ask for those capabilities through the
IPC protocol behind `moduleHost` and `eventBus`. This is the migration path for
moving the host from Node to Go later.

During runner execution `process.env` is minimal. A module only receives
service-specific environment values when it declares the matching service in
`apiDefinition.json`: `openai` maps to `OPENAI_API_KEY`, `grok` to
`GROK_API_KEY`, `xai` to `XAI_API_KEY`, `brave` to `BRAVE_API_KEY` and `news`
to `NEWS_MODEL`. Windows process basics such as `SystemRoot`, `WINDIR`, `TEMP`
and `TMP` may also be passed so the child process can start.

## Startup

- Core module executed after the initial core modules are ready.
- Requires a valid JWT to register modules in the database registry.

## Purpose

- Maintains a registry of installed modules.
- Loads modules and retries failed ones automatically.
- Starts every community module in a separate process via
  `moduleRunnerProcess.js`.
- Runs health checks in a short-lived process, then starts a fresh runtime
  process after success.
- Passes community modules a scoped `moduleHost` and event bus over IPC instead
  of the raw Express app or host objects.
- Allows community modules to emit only module-owned query/lifecycle signals,
  limited `dbSelect` reads against module-owned tables, documented public query
  contracts, or `moduleHost.storage` calls for module-owned CRUD. A
  query-looking name such as `getContentEntry` is not enough to reach into a
  core module.
- Allows only core actions that are reachable through Runtime Manager's
  documented `cmsAdminApiRequest` facade when the module declared them in
  `moduleInfo.requestedAccess` and an administrator approved the exact action
  during install or activation. The permanent grant is stored as trusted
  registry data, not read from the module folder. At runtime, unapproved core
  calls open a one-time admin prompt for that exact call. Protected user, role,
  permission, module, settings, auth and app-management events cannot become
  permanent grants; they require one-time approval by an admin with
  `modules.manageAccess` and the target permission. Raw database, token, HTTP
  and consent-management events remain hard-denied.
- Blocks sensitive read/query events such as users, roles, permissions, global
  settings, module/app registries, login strategies, importers and exporters.
  Community modules should use public runtime contracts or module-owned data
  instead of asking core system inventories directly.
- Allows listeners only on module-owned event names such as
  `<moduleName>.getItems`. It prevents subscribing to system or foreign events,
  counting their listeners, overriding the loader-issued token/nonce, using raw
  SQL placeholders, or querying tables that do not belong to the module.
- The database boundary repeats the same policy: community modules cannot write
  directly through `dbInsert`, `dbUpdate`, `dbDelete`, cannot call
  `performDbOperation` directly, cannot use raw SQL reads, cannot receive the
  host `dbClient` through custom placeholders, and cannot turn themselves into
  `moduleType: "core"` through the payload. Host-marked
  `moduleHost.storage` requests are the supported write path for module-owned
  data.
- Static asset registration is bounded by both URL and filesystem checks:
  mount paths always stay under `/modules/<moduleName>`, traversal segments are
  rejected, the target directory must exist, real paths must remain inside the
  module folder and dotfiles are ignored by the static server. The static
  middleware also refuses raw TypeScript, `.env*`, package manifests and
  dependency lockfiles before Express can serve them. Community modules may
  pass only inert cache/index/extension options; callback options such as
  `setHeaders` are refused so module code never receives host Express objects.
- Static module frontends declare `staticFrontend: true` and are mounted
  through the same static asset checks as `moduleHost.registerStaticAssets()`:
  module names are sanitized, the module folder shape is revalidated, and
  `frontend/` must resolve inside the module folder.
- Core-owned services such as Designer Manager are initialized from `mother/`
  and are not treated as community modules.
- Core-owned module names are shared ownership policy. They cannot be installed,
  activated, deactivated or uninstalled through module management APIs; they are
  updated with the application release path.
- Rejects module folders that contain `app.json`, `widgetInfo.json`, nested
  `moduleInfo.json`, `node_modules`, root host folders such as `apps/`,
  `widgets/`, `ui/`, `mother/` or `public/`, symlinks or junctions. Apps
  belong under `apps/`, widgets belong under `widgets/`, and each module folder
  owns exactly one module manifest even if somebody copies files directly into
  `modules/`.
- `activateModuleInRegistry` uses the same process health check and runtime
  process path as startup, so registry activation cannot bypass runtime
  boundaries.
- `deactivateModuleInRegistry` and module uninstall stop the runner process,
  remove runtime listeners and clear `global.loadedModules` for the module, so
  inactive modules cannot keep handling events after the registry flag changes.
- Emits system notifications via a safe wrapper that falls back to
  `console.error` if the emitter is unavailable and deactivates modules when
  initialization fails, so broken modules never appear as loaded.
- Registers each successfully loaded community module in `global.loadedModules`
  as a process runtime record, not as raw module exports.

## Listened Events

- `getModuleRegistry`
- `listActiveStaticFrontends`
- `listSystemModules`
- `inspectModuleZipAccess`
- `installModuleFromZip`
- `activateModuleInRegistry`
- `deactivateModuleInRegistry`
- `listPendingModuleAccessRequests`
- `resolveModuleAccessRequest`

Every module folder must export an `initialize` function and include
`moduleInfo.json` with metadata. Directly copied module folders are validated
the same way as uploaded ZIPs: `moduleInfo.moduleName` must match the folder
name, may contain only letters, numbers, underscores and hyphens,
`moduleInfo.moduleType` must be omitted or set to `community`, and a missing or
malformed `moduleInfo.json` keeps the module inactive.
Community module metadata cannot declare app identity fields (`appName`,
`appType`) or widget identity fields (`widgetId`, `widgetType`); apps and
widgets use their own loaders and registries.
Community module metadata may declare `permissions`, but each key must belong
to the module namespace, such as `shopSync.read`. The loader rejects wildcard
permission keys and core namespaces such as `users.*`, `modules.*`,
`userManagement.*`, `settings.*`, `auth.*`, `agent.*` and `apps.*`.

At runtime, `initialize` receives `{ motherEmitter, eventBus, moduleHost,
moduleInfo, app, isCore }`. `motherEmitter` and `eventBus` are IPC-backed
facades. They keep the loader token/nonce internal, inject the module identity
into outbound events, prevent emitting as another module, refuse
`moduleType: "core"`, allow only module-owned query names such as
`<moduleName>.getItems`, module-owned lifecycle signals and `dbSelect` against
owned tables, allow listeners only for module-owned event names, block
listener-count introspection for system/foreign events, deny token/nonce
overrides, hide injected token fields from community listener callbacks, deny
raw SQL placeholders and restrict `dbSelect` to module-owned table prefixes
such as `<moduleName>_*` or `community_<moduleName>_*`.

`moduleHost.storage` is the supported database facade for Marketplace-style
community modules. Use logical table names and await the returned promises:

```js
const rows = await moduleHost.storage.select('items', {
  where: { status: 'open' }
});

await moduleHost.storage.insert('items', {
  title: 'Hello',
  status: 'open'
});
```

The host maps `items` to an isolated physical table such as
`community_<module>_items`, injects the module identity, rejects raw SQL markers
and sends an internally marked CRUD request to the Database Manager. The facade
does not grant access to core CMS tables; those still require documented core
contracts.

`moduleHost.registerStaticAssets({ dir, mountPath, options })` is the supported
way to publish module-owned static files. Because it crosses process IPC it is
asynchronous; modules should `await` the returned promise when they need the
mount result. Event emission and listener registration are also IPC-backed, so
new modules should treat host-facing calls as asynchronous even when the facade
keeps EventEmitter-style callbacks for convenience.

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

The process runner is a host-process boundary, not a complete OS sandbox. It
keeps untrusted code out of the CMS process, prevents direct access to host
objects and prepares the module API for a future Go host. Real Marketplace
hardening should still add OS-level restrictions such as a dedicated user,
container, microVM, filesystem policy and network policy around the runner.

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

Uploaded modules run in a separate process and lack CMS host access unless the
host IPC contract grants it. Before installation the admin UI inspects the ZIP
manifest, shows declared module permissions and requested core-event access,
and sends only explicitly approved events as registry grants. Installing a
module with no approved requested access still registers the module's own
permission keys. The health check still fails closed for unapproved core
events, while later runtime attempts use the one-time admin approval queue.
Always review third-party code before installing it, and add OS/container
isolation before treating Marketplace code as fully untrusted production input.
