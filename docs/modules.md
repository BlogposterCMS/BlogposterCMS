# Module Architecture

BlogposterCMS follows a modular design. Core features and optional extensions are implemented as individual modules. Each module registers event listeners on the `motherEmitter` and performs its work in response to these events.

- **Core modules** live under `mother/modules`. They are loaded during server startup and have access to the main event system with a high-trust JWT.
- **Optional modules** can be placed in the top-level `modules/` directory. The Module Loader runs a health check in a sandbox before activating them. This isolation prevents a bad plugin from crashing the whole system.
- **Events** are used instead of direct function calls. Modules emit events to perform actions such as database operations, authentication or theme management. Tokens in the payload ensure that only authorised modules can request sensitive operations.

When creating your own modules, start by exporting an `initialize` function that receives `{ motherEmitter, jwt, isCore }`. See the existing modules for reference.

## The JWT Event Bus

Modules communicate exclusively through the meltdown event bus. Every event payload contains a signed JWT that declares the module name, type and requested permissions. The `motherEmitter` validates these tokens before dispatching the event. If a token lacks the required permission, the call is rejected.

This mechanism ensures that even community modules cannot bypass security boundaries. Always keep your JWT secrets private and avoid exposing them in logs or client-side code.

## Creating a New Module

1. Add a new folder under `modules/`.
2. Place an `index.js` file inside it with an exported `initialize` function.
3. Include a `moduleInfo.json` file with metadata. It must define `moduleName`, `version`, `developer` and `description` so the loader can detect updates and show author details. Additional fields like permissions are optional.
4. Register any meltdown listeners within the `initialize` function. Use `motherEmitter.on('eventName', handler)` to react to events.
5. Restart the CMS. The Module Loader will sandbox your module and activate it if no errors occur.

Modules should avoid direct imports from other modules. Instead, emit events to request data or actions. This keeps modules loosely coupled and easier to maintain.

## Tips for Developing Modules

- Keep event names unique to avoid collisions with other modules.
- Validate incoming data and reject requests that lack a proper JWT or required permissions.
- Document your module's events and configuration in its own README or `moduleInfo.json`.
- Limit dependencies and run `npm audit` frequently to catch vulnerabilities early.

## Individual Module Docs

See the [`modules`](modules) directory for a breakdown of each built-in module.
Every file lists how the module is started, which events it listens to and any
important security notes.

### Available Modules

- [auth](modules/auth.md)
- [databaseManager](modules/databaseManager.md)
- [dependencyLoader](modules/dependencyLoader.md)
- [importer](modules/importer.md)
- [mediaManager](modules/mediaManager.md)
- [moduleLoader](modules/moduleLoader.md)
- [requestManager](modules/requestManager.md)
- [notificationManager](modules/notificationManager.md)
- [pagesManager](modules/pagesManager.md)
- [plainSpace](modules/plainSpace.md)
- [serverManager](modules/serverManager.md)
- [settingsManager](modules/settingsManager.md)
- [shareManager](modules/shareManager.md)
- [translationManager](modules/translationManager.md)
- [unifiedSettings](modules/unifiedSettings.md)
- [userManagement](modules/userManagement.md)
- [widgetManager](modules/widgetManager.md)
- [dummyModule](modules/dummyModule.md)
- [fontsManager](modules/fontsManager.md)
- [Choosing a Database Engine](choosing_database_engine.md)
