# appLoader

Builds the app registry by scanning `apps/*/app.json` manifests during startup.
The registry feeds the builder and admin UI so available apps and their entry
points are known ahead of time.

## Startup
- Core module executed during boot before the server begins listening.
- Reads each `app.json` manifest under `apps/` and records metadata for the app.
- Validates app manifests before activation; malformed bridge declarations keep
  the app inactive instead of letting it fail later at dispatch time.
- Ensures the persistent `app_registry` table exists via the
  `INIT_APP_REGISTRY_TABLE` placeholder.
- Skips malformed or inaccessible manifests and emits warning notifications.
- Stores whether an app has a built `index.html` and marks apps without one as
  inactive.

## Purpose
- Maintains the persistent registry of available apps.
- Exposes core events for app discovery and lifecycle management:
  `listApps`, `getApp`, `getAppLaunchInfo`, `rescanApps`,
  `installAppFromDirectory` and `uninstallApp`.
- Handles `dispatchAppEvent` messages forwarded from sandboxed iframes with a
  strict bridge contract.
- Allows app lifecycle events such as `designer-ready` and routes backend
  commands only through the `runtimeManager` admin facade.
- Accepts legacy app `meltdownEmit` calls through a postMessage bridge only
  when the target event is explicitly listed in the app manifest
  `allowedEvents` and maps to a `runtimeManager` facade contract. The bridge is
  compatibility input only; AppLoader dispatches the work through
  `cmsAdminApiRequest` or `cmsPublicRuntimeRequest`, never by forwarding raw
  system events. User-managed apps must use `cms-admin-request`, which is
  query-only for app-origin calls.
- Expands manifest `agentSurface` opt-in into the safe agent surface event
  subset. This lets ordinary apps publish visible state and consume their own
  queued agent commands without copying the AgentManager event list into every
  `allowedEvents` array.
- Supplies Webpack with entry point information so app bundles can be resolved
  automatically.
- Persists registry entries through database placeholders, supporting SQLite,
  PostgreSQL and MongoDB backends.
- Validates `requiredEvents` declared in app manifests before serving an app and
  blocks launch if any API event has no listener.

## APIs
- `POST /admin/api/apps/install` delegates to `installAppFromDirectory`.
- `DELETE /admin/api/apps/:appName` delegates to `uninstallApp`.
- Both endpoints require an authenticated admin with `builder.manage` permission
  for backwards compatibility.
- Runtime/admin facade actions use the narrower `apps.list`, `apps.install`,
  `apps.delete` and `apps.rescan` permissions.
- App management and discovery events (`listApps`, `getApp`,
  `getAppLaunchInfo`, `listBuilderApps`, `installAppFromDirectory`,
  `uninstallApp` and `rescanApps`) are not raw public `/api/meltdown` targets.
  External admin/editor clients use the dedicated admin routes or the
  `runtimeManager` `apps` resource instead of dispatching raw appLoader events.
- Those events all require a scoped AppLoader core payload
  (`moduleName: "appLoader"`, `moduleType: "core"` and a valid JWT); a browser
  or app-supplied `decodedJWT` object alone is never treated as caller identity.

## Boundaries

## Security Notes
- Manifest paths are resolved and normalized to block directory traversal.
- App install, uninstall and rescan are centralized in this core module so HTTP
  routes and apps do not perform direct registry writes or filesystem deletes.
- Builder discovery and `/admin/app/:appName` launch use appLoader-validated
  folder metadata instead of reading `apps/*/app.json` directly.
- `dispatchAppEvent` uses the same validated app folder metadata as launch
  before checking the manifest and accepting a message.
- App folders cannot contain `moduleInfo.json` or `widgetInfo.json` at any
  depth. Modules, widgets and apps use separate installation paths and registry
  ownership.
- App manifests are bound to the folder identity. If `app.json` declares
  `name`, it must match the validated app folder or install target name.
- App manifests cannot declare legacy app identity fields (`appName`,
  `appType`). The canonical app identity is `name`.
- App manifests cannot declare module identity fields (`moduleName`,
  `moduleType`) or widget identity fields (`widgetId`, `widgetType`). Apps may
  only reference core target modules inside `allowedEvents[]` descriptors.
- App folders cannot contain nested `app.json`, `.env*`, package manager
  config files, package manifests/lockfiles or `node_modules`. Runtime secrets,
  package-manager credentials and embedded Node runtimes do not belong in
  deployable app folders.
- App installs validate the source folder shape and real path before replacing
  an existing app folder.
- App folders cannot contain symlinks or junctions; app assets must be real
  files under the app directory.
- User-managed app client files are scanned before activation. Direct
  `/api/meltdown` calls, bundled Meltdown bridge bootstraps, admin/CSRF token
  scraping, authenticated same-origin fetches and raw admin/API fetches are
  rejected; apps must talk to the host through the audited postMessage bridge.
- Static `/apps` delivery is protected by a realpath guard before Express serves
  files, so symlinks or junctions cannot escape the app root.
- Browser static delivery refuses raw TypeScript, runtime secret files and
  package manifests/lockfiles from app and asset roots.
- App lifecycle messages are re-emitted as `appLoader:appEvent`; arbitrary event
  names are rejected.
- Backend commands from apps must use event `cms-admin-request` with
  `{ resource, action, params }`, which is dispatched as
  `runtimeManager.cmsAdminApiRequest`.
- App-origin `cms-admin-request` calls are query-only. Mutating actions such as
  create/update/delete/install/rescan are rejected by `runtimeManager` even when
  the current admin principal has those permissions.
- Legacy app bridge calls use `cms-meltdown-request` or
  `cms-meltdown-batch-request` and are reserved for core-owned compatibility
  apps unless the manifest opts into the narrow Agent surface. The loader strips
  app-supplied JWT/module identity, injects the parent admin principal
  server-side, blocks raw database placeholders, rejects low-level system
  events, requires a manifest allowlist entry and routes legacy target events
  through `runtimeManager` facade resources.
- Auth token/session-control events are not valid app bridge contracts. Apps
  cannot allow or dispatch token issuing, token revocation, token lifetime
  changes or `validateToken` through `allowedEvents`; they must use documented
  runtime/admin facade actions instead.
- Sensitive system query events such as user/role/permission lists, auth
  strategy management, app/module registries, settings, theme/import/export
  directories and other system inventories are also not valid direct app bridge
  contracts. Apps must use audited runtime/admin facade resources or app-owned
  events instead.
- Manifest `allowedEvents` entries must be objects with `eventName`,
  `moduleName`, `moduleType: "core"` and `access`. String shorthand is rejected
  so every app bridge target is bound to a core contract. `access` is required,
  not implied, and `moduleName` must be a normalized core contract name that
  matches the event's `runtimeManager` facade resource.
  User-managed apps cannot dispatch `allowedEvents` through the direct bridge;
  they must query through runtime contracts instead. Core-owned internal apps
  such as the Designer may declare read/write compatibility events only when
  those events have an audited runtime facade mapping.
- Manifest `agentSurface: true` or an enabled `agentSurface` object is the
  only supported direct-bridge exception for non-core apps. The loader adds only
  the surface-owned AgentManager events required to publish snapshots, read
  compact surface context/action metadata, poll queued commands and acknowledge
  command results. It does not grant controller operations such as
  `agent.enqueueSurfaceCommand` or `agent.invokeSurfaceCommand`.
- For those non-core AgentManager calls, AppLoader replaces any app-supplied
  `appName` with the validated app name from the launch context. This prevents
  a sandboxed app from publishing, polling or acknowledging another app's
  surface while still letting it choose its own `surfaceId`.
- Core-owned internal apps cannot be installed, replaced or uninstalled through
  app management APIs. They ship with the codebase and are updated through the
  normal application release path, not by user-managed app packages.
- Apps run in sandboxed iframes without `allow-same-origin`, so they cannot read
  the parent dashboard's admin token. They must communicate through the
  postMessage bridge.
- Apps must not call low-level system events, raw database events or module
  internals directly.
- Registry consumers should still validate user input before loading assets.

The module keeps app discovery isolated so untrusted manifests cannot crash the
server or expose sensitive paths. Notifications use a wrapper that falls back to
`console.error` if the emitter is missing.
