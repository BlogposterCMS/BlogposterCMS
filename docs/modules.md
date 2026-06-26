# Module Architecture

BlogposterCMS follows a modular design. Core features and optional backend capabilities are implemented as individual modules. Each module registers event listeners on the `motherEmitter` and performs its work in response to these events.

- **Core modules** live under `mother/modules`. They are loaded during server startup and have access to the main event system with a high-trust JWT.
- **Optional modules** can be placed in the top-level `modules/` directory. The Module Loader loads, health-checks and registry-activates them through a sandbox. This isolation prevents a bad module from crashing or controlling the whole system.
- **Widgets** are renderable UI blocks. They should not own server capabilities; they use UI contracts and public/admin API facades.
- **Apps** are isolated admin or tool surfaces. They should call stable CMS facades instead of importing backend internals.
- **Events** are used instead of direct function calls. Modules emit events to perform actions such as database operations, authentication or theme management. Tokens in the payload ensure that only authorised modules can request sensitive operations.

When creating your own modules, start by exporting an `initialize` function that receives `{ motherEmitter, jwt, nonce, isCore }`. `jwt` is issued by the Module Loader and must be included with every non‑public event. `nonce` protects against replay attacks. Core modules also receive `isCore` to reflect their trust level. Modules no longer need to call `issueModuleToken`; the loader handles token issuance during initialization.

Community modules also receive `{ eventBus, moduleHost }`. `eventBus` is a scoped facade; it injects the module identity and token into emitted payloads, prevents token/nonce overrides, tags listeners for cleanup, allows only read/query CMS event names plus module-owned lifecycle signals, allows listeners only on module-owned event names, blocks listener-count introspection for system/foreign events, and refuses raw SQL placeholders. The `databaseManager` repeats this rule at the database boundary: community modules cannot write through `dbInsert`, `dbUpdate`, `dbDelete`, cannot call `performDbOperation` directly, and cannot spoof `moduleType: "core"`. `moduleHost` exposes stable capabilities such as `registerStaticAssets({ dir, mountPath })`.

Community modules never receive the raw Express `app`. Static assets are constrained under `/modules/<moduleName>` and must live inside the module folder. Use `moduleHost.registerStaticAssets()` or a documented core module contract instead of Express routes.

Community modules also cannot opt out of the sandbox or import host process modules such as `child_process`, raw network clients or arbitrary npm packages. They can read their own files through scoped read-only `fs`; system changes must be requested through explicit core contracts.

The sandbox also blocks dynamic code generation (`eval`, `Function`, dynamic `import()`, `constructor.constructor`) and hardens exposed facades so modules cannot climb from `moduleHost`, `eventBus`, `app`, `path`, `fs`, `crypto`, timers or `console` back into the host process.

## Module, Widget And App Boundary

- Modules own backend capabilities and may expose events or static assets through `moduleHost`.
- Widgets own small renderable UI surfaces and call frontend/API contracts only.
- Apps own larger admin or tool experiences. They run in sandboxed iframes,
  receive no parent admin token, and communicate through AppLoader's
  postMessage bridge. Query-style CMS access goes through the runtime/admin
  facade; non-core apps cannot declare direct write bridge events, and any
  direct app event must be explicitly declared in the app manifest
  `allowedEvents`.
- Optional modules cannot emit as `core`, cannot spoof another module, cannot override their loader-issued token/nonce, cannot emit non-query CMS events, cannot subscribe to system or foreign events, cannot count system listeners, cannot use raw SQL placeholders, and cannot write directly to the database. Module-owned lifecycle signals such as `<module>.ready` are allowed; system changes must go through a core module contract.
- Optional modules cannot emit `httpRequest` directly. Outbound network access belongs behind audited core contracts.
- Optional modules that request runtime dependencies are limited to package
  names explicitly whitelisted for their own module; host built-ins and path
  imports are rejected. Their scoped event bus cannot emit `requestDependency`
  directly.
- New work should not introduce a fourth add-on category beyond modules, widgets and apps.

## The JWT Event Bus

Modules communicate exclusively through the meltdown event bus. Every event payload contains a signed JWT that declares the module name, type and requested permissions. The `motherEmitter` validates these tokens before dispatching the event. If a token lacks the required permission, the call is rejected.

This mechanism ensures that even community modules cannot bypass security boundaries. Always keep your JWT secrets private and avoid exposing them in logs or client-side code.

## Creating a New Module

1. Add a new folder under `modules/`.
2. Place an `index.js` file inside it with an exported `initialize` function.
3. Include a `moduleInfo.json` file with metadata. It must define `moduleName`, `version`, `developer` and `description` so the loader can detect updates and show author details. Additional fields like permissions are optional.
4. Register any meltdown listeners within the `initialize` function. Use `motherEmitter.on('eventName', handler)` to react to events.
5. Restart the CMS. The Module Loader will sandbox your module and activate it if no errors occur.

Modules should avoid direct imports from other modules. Instead, emit events to request data or actions through documented contracts. This keeps modules loosely coupled and easier to maintain.

## Tips for Developing Modules

- Keep event names unique to avoid collisions with other modules.
- Validate incoming data and reject requests that lack a proper JWT or required permissions.
- Document your module's events and configuration in its own README or `moduleInfo.json`.
- Avoid bundled dependencies and host imports; request audited core contracts for services that need system, network or database authority.

## Individual Module Docs

See the [`modules`](modules) directory for a breakdown of each built-in module.
Every file lists how the module is started, which events it listens to and any
important security notes.

### Available Modules

- [auth](modules/auth.md)
- [agentAccess](modules/agentAccess.md)
- [agentManager](modules/agentManager.md)
- [appLoader](modules/appLoader.md)
- [commentsManager](modules/commentsManager.md)
- [contentEngine](modules/contentEngine.md)
- [databaseManager](modules/databaseManager.md)
- [dependencyLoader](modules/dependencyLoader.md)
- [designerManager](modules/designerManager.md)
- [exportManager](modules/exportManager.md)
- [importer](modules/importer.md)
- [mediaManager](modules/mediaManager.md)
- [metadataManager](modules/metadataManager.md)
- [moduleLoader](modules/moduleLoader.md)
- [navigationManager](modules/navigationManager.md)
- [requestManager](modules/requestManager.md)
- [notificationManager](modules/notificationManager.md)
- [pagesManager](modules/pagesManager.md)
- [plainSpace](modules/plainSpace.md)
- [redirectManager](modules/redirectManager.md)
- [runtimeManager](modules/runtimeManager.md)
- [serverManager](modules/serverManager.md)
- [settingsManager](modules/settingsManager.md)
- [seoManager](modules/seoManager.md)
- [searchManager](modules/searchManager.md)
- [shareManager](modules/shareManager.md)
- [themeManager](modules/themeManager.md)
- [translationManager](modules/translationManager.md)
- [unifiedSettings](modules/unifiedSettings.md)
- [userManagement](modules/userManagement.md)
- [workflowManager](modules/workflowManager.md)
- [widgetManager](modules/widgetManager.md)
- [dummyModule](modules/dummyModule.md)
- [fontsManager](modules/fontsManager.md)
- [Choosing a Database Engine](choosing_database_engine.md)
