# BlogposterCMS Architecture Overview

BlogposterCMS is designed around a modular core that communicates exclusively via a JWT-secured event bus. Each module emits or listens for events on the `motherEmitter`. Every payload contains a signed token which declares the module name and required permissions. The emitter validates these tokens before dispatching any action, isolating modules from each other and providing a strong security boundary.

## Core vs Community Modules

- **Core modules** ship with the CMS and live in `mother/modules`. They are loaded at server start and receive a high-trust token so they can perform privileged operations. Core bootstrap issues tokens per core module identity; new code should not reuse one module's token for another module's payload.
- **Community modules** live under `modules/`. They are validated, health-checked in a short-lived runner process and started in a fresh runtime process if they pass. These modules run with lower trust tokens and are restricted to the permissions granted in their JWT.
- Community modules do not receive the raw Express app or host objects. The module loader exposes `moduleHost` plus a scoped event bus through an IPC contract so static registration and event emission stay behind a stable process boundary. This is the migration seam for moving the core host from Node to Go later.

## Event Driven Workflow

1. Modules register listeners on the event bus using `motherEmitter.on()`.
2. When a module needs to perform an action (for example a DB query) it emits an event such as `dbSelect` with its token.
3. The emitter checks the token, verifies the module and permission, then routes the request to the appropriate handler.
4. Results are returned via callback, keeping modules loosely coupled.

For community modules, `motherEmitter` is a scoped facade supplied by the loader. It automatically tags listeners with the module name and prevents a module from emitting as another module or as `core`.

This design ensures that even optional modules cannot bypass security rules or directly access the internals of other modules.

## Server Composition

The Node entry point `app.js` is intentionally thin. It loads environment
configuration, attaches process-level error/shutdown handlers, then delegates
Express setup to `mother/server/createBlogposterApp.js`. Host concerns such as
static assets, security middleware, HTTP routers, installation state and module
bootstrap live under `mother/server/` so they can be tested without turning the
entry point into a central implementation file again.

Core product behavior still belongs in `mother/modules/*`. Server composition
files may mount routers, guard asset delivery and bootstrap modules, but should
not become a second module system or own CMS business logic.

## Modules, Widgets And Apps

- Modules own backend capabilities and run behind the JWT-secured event bus.
- Widgets are renderable UI blocks. They must not own backend authority or read
  admin secrets.
- Apps are larger admin/tool surfaces. They run in sandboxed iframes without
  Same-Origin access to the dashboard and talk to the CMS through AppLoader's
  postMessage bridge. App-origin CMS facade calls are query-only; non-core apps
  cannot declare direct write bridge events. Any direct app event must be
  manifest allowlisted and is still blocked from low-level system or raw
  database events.

## Security Layers

- **JWT Signatures** – Every event payload must include a signed token. Invalid or missing tokens cause the request to be rejected.
- **Process isolation** - Optional modules execute outside the CMS host process. Health checks and runtime initialization both use the runner protocol, and invalid host requests deactivate the module.
- **Permission Checks** – Many events verify explicit permissions before executing. Admin routes require valid credentials and user roles.

- **Identity Binding** - Registered module type wins over the payload, and non-high-trust module tokens cannot emit as another module.
- **Host Contract** - Community modules use `moduleHost` capabilities such as `eventBus` and `registerStaticAssets()` instead of direct server access.

By layering these protections the CMS keeps community code out of the host process. Real Marketplace production hardening still needs OS/container isolation around the runner process.
