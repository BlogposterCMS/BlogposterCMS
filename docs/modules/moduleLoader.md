# Module Loader

Loads optional community modules from the top-level `modules/` directory. Each
community module is validated, health-checked in a short-lived runner process,
then started in a fresh runtime runner process if the health check succeeds.
Community module code is never required into the CMS host process.

The runner boundary is intentionally process-based and language-neutral. The
CMS host owns the event bus, tokens, permissions and database
contracts; the module process can only ask for those capabilities through the
IPC protocol behind `moduleHost` and `eventBus`. This is the migration path for
moving the host from Node to Go later.

Runner execution requires the [mandatory Linux sandbox](../community-isolation.md).
No provider credentials enter process.env. apiDefinition.json never authorizes
secret delivery. Windows/macOS hosts have no unsandboxed fallback. Modules are
backend-only; UI belongs to the isolated widget contract.

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
- Acknowledges an unclaimed `<moduleName>.ready` lifecycle signal once during
  runtime startup. A core listener registered for that event takes precedence;
  the fallback only prevents documented readiness announcements from becoming
  misleading unhandled-event warnings.
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
  calls fail closed. The runtime rechecks current registry grants on each call;
  one-time prompts and old in-memory grants are no longer authorization paths.
  Protected system-management, raw database, token and HTTP events stay denied.
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
- Rejects module UI publication with `E_MODULE_UI_DENIED`, including former
  `staticFrontend` declarations and `moduleHost.registerStaticAssets` calls.
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
- Retains existing override files as operator data; former static overrides are
  not executed or served. Migrate UI customization into the widget package.
- Updates installed community modules from an explicit `trustedUpdateSource`
  in the registry metadata. The updater fetches GitHub release assets through
  the Module Loader, requires a matching ZIP plus SHA-256 sidecar, optionally
  verifies a signature when a public key is configured, reuses the installer
  validation policy, compares permission/access diffs, runs a health check and
  swaps the managed module folder with a backup for rollback.
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
- `checkModuleUpdates`
- `inspectModuleUpdate`
- `installModuleUpdate`
- `setModuleUpdateSource`
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

Host-facing calls are asynchronous. Direct Express access and static asset
registration are unavailable; `ALLOW_COMMUNITY_APP_ACCESS` cannot enable them.
Use Widget Manager for UI and documented core contracts for backend behavior.

## Boundaries

The intended add-on vocabulary is strict:

- modules add backend capability contracts
- widgets render UI blocks
- apps provide isolated admin/tool surfaces

Widgets and apps should query the CMS through public APIs, shared UI clients or
the `runtimeManager` admin facade instead of reaching into server internals.

The runner uses read-only code mounts, private Linux namespaces and seccomp.
See [deployment prerequisites and limits](../community-isolation.md). Startup,
health checks and activation use the same isolation; no legacy process fallback
exists. Keep the kernel and runtime patched.

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

Optional backend files and `apiDefinition.json` may be included. A former
`frontend/` folder is retained as bytes only and is never served. Module ZIPs and unpacked module folders cannot contain app manifests
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
events, and later runtime attempts also fail closed. Review third-party code
and validate the mandatory sandbox before deployment.

## Module Updates

Managed code updates go through the installer and retain existing data/override
files. Former static overrides are not served; migrate them to widget source.

An installed module may declare or receive a registry-owned update source:

```json
{
  "trustedUpdateSource": {
    "provider": "github",
    "owner": "acme",
    "repo": "shop-sync",
    "assetPattern": "shopSync-*.zip",
    "sha256AssetPattern": "shopSync-*.zip.sha256",
    "releaseChannel": "stable",
    "publicKey": null,
    "enabled": true
  }
}
```

The updater supports GitHub releases only. Stable sources ignore prereleases;
`releaseChannel: "prerelease"` allows prerelease assets. Each release must
publish a ZIP asset that matches `assetPattern` and a sidecar named either
`<zip-name>.sha256` or matching `sha256AssetPattern`. If `publicKey` is set,
the release must also publish `<zip-name>.sig` or an asset matching
`signatureAssetPattern`; the signature is verified over the ZIP bytes.

Update checks are exposed through Runtime Manager's admin facade:

- `modules.checkUpdates` lists configured modules and reports whether a newer
  GitHub release asset is available.
- `modules.inspectUpdate` downloads the candidate, verifies its hash/signature
  and reports the same manifest/access data as ZIP inspection plus
  `newPermissions`, `newRequestedAccess` and `requiresAdminApproval`.
- `modules.installUpdate` requires admin approval when the update asks for new
  core access. It extracts to `temp_uploads/module-updates`, health-checks the
  package, backs up the existing folder under `data/module-backups`, swaps the
  new folder into `modules/<moduleName>`, writes update metadata into the
  registry and reloads active modules.
- `modules.setUpdateSource` stores a normalized GitHub source on the registry
  manifest. It does not download or install code.

The Modules admin list still shows per-module update badges/actions beside the
existing activation controls. Settings > Update Center provides the consolidated
admin surface for checking all installed community modules, seeing source/check
state and installing available updates from one screen.

The package must keep the same `moduleInfo.moduleName` and declare a newer
semantic version. Downgrades, module-name mismatches, missing hashes, hash
mismatches, forbidden files, host folders, symlinks, package manifests and
permission/access policy violations fail closed with `E_MODULE_UPDATE_*` or the
existing installer error code. If folder swapping fails after the old module
was moved aside, the updater restores the previous folder before surfacing
`E_MODULE_UPDATE_SWAP_FAILED`; a failed restore uses
`E_MODULE_UPDATE_ROLLBACK_FAILED`.

## Explicit package consent

The supported UI ZIP path now uses strict manifest consent. See the
[community guide](../community_module_guide.md#installing-a-module).
`modules.inspectZip` returns `reviewedHash`; `modules.installZip` requires that hash
and `approvedAccess`. `modules.setAccess` replaces the approved descriptors under
`modules.manageAccess`. A grantor must hold the target action permission.
`modules.installUpdate` also accepts the reviewed update hash for strict packages.
All community execution uses the strict contract; no legacy consent fallback remains.
These actions use the existing Runtime Manager facade and generated event catalog;
a dedicated AgentManager upload/review interaction adapter is not yet supplied.
