# Meltdown Event Bus

BlogposterCMS modules communicate exclusively via the **meltdown event bus**. It
is powered by the `motherEmitter` which verifies JSON Web Tokens on every event
before dispatching them. When a module misbehaves, the emitter can trigger a
*local meltdown* for that module so it can no longer execute actions.

## Event Lifecycle

1. A module emits an event with a payload containing its `moduleName`,
   `moduleType` and a signed JWT.
2. `motherEmitter` checks whether the module is currently in meltdown. If so,
   the event is ignored.
3. If the event is public (currently `issuePublicToken` or
   `ensurePublicToken`) it bypasses JWT checks but still logs the call.
4. Non‑public events require a valid JWT. The emitter decodes the token,
   combines the secret with the correct salt depending on `trustLevel` and then
   verifies it.
5. If a registered module type exists, it wins over the payload. A community
   module cannot set `moduleType: "core"` to bypass a boundary.
6. Standard module tokens that carry a `moduleName` claim must match the
   payload `moduleName`. High-trust core tokens are reserved for controlled
   bootstrap/delegation flows; new code should request a token for the module it
   emits as.
7. If verification succeeds, the event is dispatched to all listeners. Any
   thrown error triggers a meltdown for that module, removing all of its
   listeners.

`deactivateModule` and `removeListenersByModule` are internal runtime cleanup
events. They cannot be emitted directly by modules, apps or HTTP callers. Core
code must use the internal motherEmitter helpers so cleanup events carry the
private marker required by the bus.

## HTTP Adapter Boundary

The public `/api/meltdown` route is an adapter, not a raw bus socket. It blocks
direct database/system events, raw placeholder payloads and facade-owned core
read/write events. Admin/editor clients should call `cmsAdminApiRequest` with
`{ resource, action, params }` for CMS operations.
Direct event names are limited to explicit adapter contracts: public token
bootstrap, `cmsPublicRuntimeRequest`, `cmsAdminApiRequest` and the AppLoader
`dispatchAppEvent` bridge. Everything else must be wrapped by one of those
contracts before it can leave the browser.
The adapter treats authentication as transport metadata: tokens are accepted
only from the `X-Public-Token` header or the `admin_jwt` cookie. Caller-supplied
`jwt` and `decodedJWT` fields in request payloads are stripped before dispatch
and re-injected only after server-side token validation.
If the translated target event is not registered, the adapter returns an error
instead of forwarding into the raw emitter; unregistered names are not treated as
implicit add-on points.

Public page rendering uses a separate `cmsPublicRuntimeRequest` facade. Public
page, widget, PlainSpace layout, Designer layout, font, setting, user-count,
registration and login-strategy reads are exposed as Runtime Manager
`resource`/`action` entries. The facade validates the caller token, then uses
the Runtime Manager's core token to call only the mapped public-safe module
events. It is not available as a direct module/app escape hatch.

Public bootstrap uses a separate, small public-token contract:
`issuePublicToken` and `ensurePublicToken`. Browser install, login-discovery,
registration and favicon helpers use that token with `cmsPublicRuntimeRequest`;
direct public core events such as `getPublicSetting`, `getUserCount`,
`listActiveLoginStrategies` and `publicRegister` are internal module events, not
HTTP contracts. The login route may call `loginWithStrategy` server-side after
issuing a scoped public token, but browsers should not call it through
`/api/meltdown`.

AgentManager has its own `/admin/api/agent` HTTP facade and an app-loader
`agentSurface` bridge for surface-owned snapshot/poll/ack events. Raw
`agent.*` events are not exposed through `/api/meltdown`.

The HTTP adapter no longer translates old browser event names. Content, page,
media, widget, PlainSpace, navigation, search, setting, auth, font, user,
role, app, importer, exporter, theme, Designer and preview-token operations
must enter through `cmsAdminApiRequest`, `cmsPublicRuntimeRequest`, AppLoader or
a purpose-built HTTP adapter such as auth/install/upload.

## Why Meltdown?

The goal is **containment**. If a community module crashes or tries to bypass
permissions, only that module is disabled. The rest of the CMS keeps running
and administrators are notified via the notification system. This approach helps
maintain security when running untrusted code.

## Writing Safe Event Handlers

- Validate payload fields before performing actions.
- Return errors through the callback so the emitter can react properly.
- Avoid long synchronous tasks that block the event loop; they may cause
  timeouts and trigger a meltdown unintentionally.

For an overview of how modules use this bus, see [Module Architecture](modules.md).
