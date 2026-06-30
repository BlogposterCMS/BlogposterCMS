# Event-First Transport Boundary

This report records the current architecture decision for BlogposterCMS:
the core stays event-first, while HTTP stays a transport and facade layer.

The goal is not to replace every HTTP route with a raw event socket. The goal is
to prevent browser code, apps, widgets and future integrations from bypassing
module ownership, permissions, validation and runtime facade contracts.

## Decision

BlogposterCMS should keep this direction:

```text
Browser, app, widget or public caller
  -> HTTP, postMessage or shared browser client
  -> Runtime Manager facade or AppLoader facade
  -> JWT-checked module event
  -> owning core module or community module host capability
```

New CMS operations should use stable facade requests such as
`cmsAdminApiRequest` or `cmsPublicRuntimeRequest` with
`{ resource, action, params }`. New code should not introduce domain-specific
REST controllers that call module services directly when an existing module,
event or runtime facade can own the behavior.

HTTP remains valid for edges that are naturally transport concerns:

- Login, logout, registration and install flows that manage cookies, CSRF or
  first-run HTML.
- Public read APIs such as `/api/public/*`, sitemap, robots, redirects and
  public comments, as owned by Runtime Manager.
- Agent HTTP facades that translate to AgentManager contracts.
- Static assets, uploads and downloads when the route is only moving bytes and
  the owning module still validates metadata and permissions.
- `/api/meltdown` and `/api/meltdown/batch` as adapters, not as an unrestricted
  external event bus.

## Current State

The architecture already supports the decision.

- `app.js` is only the process entry point. Server composition lives in
  `mother/server/createBlogposterApp.js`.
- `motherEmitter` validates module identity, JWTs, trust level and internal
  system event markers before dispatch.
- `meltdownHttpPolicy` blocks direct database/system events, strips payload auth
  metadata and exposes only direct facade contracts through `/api/meltdown`.
- `runtimeManager` owns the admin `cmsAdminApiRequest` facade and the public
  read-only `cmsPublicRuntimeRequest` facade.
- `appLoader` routes app iframe commands through Runtime Manager instead of
  letting apps emit arbitrary core events.
- Community modules use a process runner, scoped event bus, `moduleHost.storage`
  and bounded static asset registration instead of the raw Express app.
- UI architecture docs already say browser code should use shared clients and
  typed contracts instead of knowing server module internals.

The remaining gap is coverage and ergonomics. Active
browser, app, widget and public runtime helpers should keep using shared
resource/action facade clients; new low-level event names must be added behind
Runtime Manager or AppLoader, not exposed directly through HTTP.

## Transport Classes

### Allowed

- `cmsAdminApiRequest` for authenticated admin/editor CMS actions.
- `cmsPublicRuntimeRequest` for public rendering reads.
- `dispatchAppEvent` and AppLoader `cms-admin-request` for iframe apps.
- AgentManager HTTP routes for agent snapshots and commands.
- Runtime Manager public HTTP routes for published public resources.
- Auth, install and upload routes when they remain thin transport adapters.

### Transitional Shell APIs

- `window.meltdownEmit` and `window.meltdownEmitBatch` remain the browser
  transport functions, but callers should pass `cmsAdminApiRequest`,
  `cmsPublicRuntimeRequest`, `dispatchAppEvent` or token bootstrap events.
- Core-owned bundled apps such as Designer may use the AppLoader bridge, which
  validates the app manifest and forwards only resource/action facade requests.

### Not Allowed For New Work

- New domain REST controllers that own CMS behavior outside `mother/modules/*`.
- Browser, app or widget calls to raw database, system, lifecycle or placeholder
  events.
- Community module access to the raw Express app or host internals.
- Public route behavior that trusts caller-supplied `jwt`, `moduleName`,
  `moduleType`, `decodedJWT` or raw SQL-style placeholders.
- A fourth extension category beyond modules, widgets and apps.

## Risks

### Facade Map Drift

`meltdownHttpPolicy` owns which facade events may cross HTTP, while
`runtimeManager` owns the resource/action maps. If one changes without tests,
a caller can receive confusing errors or the policy can become broader than
intended.

Mitigation: keep policy tests, Runtime Manager facade tests and UI boundary
tests together whenever expanding the facade surface.

### Oversized Runtime Manager

Runtime Manager is the right ownership point for HTTP/public/facade behavior,
but its implementation is large. More actions should not make the file harder
to audit.

Mitigation: split action maps and handlers by domain while preserving the
existing event names and public facade behavior.

### Raw Client Event Habit

The browser has a useful generic `meltdownClient`, but callers can still pass
any event name. That is ergonomic during migration and risky as a long-term API.

Mitigation: add shared clients such as `cmsAdmin.request(resource, action,
params)` and `cmsPublicRuntime.request(resource, action, params)` on top of the
existing transport.

### Error Contract Inconsistency

Some paths return searchable error codes, while others return plain messages or
regex-tested strings.

Mitigation: introduce a stable error shape with `code`, `message`, `status` and
sanitized `details`, then require facade, HTTP and UI tests to preserve the
code.

### Removed Standalone REST Configuration

The sample configuration exposes no standalone REST API flags. HTTP entry
points are the facade-backed routes documented here, not a second API server.

## Implementation Plan

### Phase 1: Contract Inventory

- Define one documented inventory of admin and public facade actions.
- Add or extend tests so `meltdownHttpPolicy` direct facade allowlists and
  `runtimeManager` resource/action definitions cannot drift silently.
- Classify all `/api/*` and `/admin/api/*` routes as adapter, public facade,
  agent facade or auth/install/upload.
- Keep sample configuration limited to routes and limits the current server
  actually reads.

### Phase 2: Shared Browser Facade Client

- Keep `createMeltdownClient` as the low-level transport.
- Add a shared facade client that exposes admin and public runtime resource
  requests.
- Preserve existing exported helper functions so Runtime, Shell and Designer
  callers can migrate without a large rewrite.
- Normalize facade errors into the shared error shape.

### Phase 3: Public Runtime First

- Keep `ui/runtime/main/runtimePageData.ts` and public loaders on
  `cmsPublicRuntimeRequest` and `cmsAdminApiRequest` shapes.
- Keep current public rendering behavior and page/widget/layout normalization.
- Add regression tests for public page reads, widget registry reads, public
  Designer reads and admin-only layout saves.

### Phase 4: Shell And App Bridge

- Add resource/action helpers to `pageDataLoader` and shell data modules.
- Expose a first-class app bridge API such as
  `blogposterApi.request({ resource, action, params })`.
- Keep `window.meltdownEmit` as the low-level browser transport, but avoid raw
  core event names in Shell and bundled app code.

### Phase 5: Designer And Widgets

- Move Designer backend calls into small Designer data modules.
- Use resource/action facades for page, layout, media, widget registry and
  publish flows.
- Give widget contexts a constrained CMS facade instead of raw `ctx.emit` where
  practical.
- Keep internal runtime events such as widget usage registration hidden behind
  runtime helpers.

### Phase 6: Runtime Manager Modularization

- Split facade maps and dispatch helpers by domain.
- Preserve public event names and response shapes.
- Add route inventory and error-code propagation tests before changing behavior.

## Test Matrix

Every meaningful implementation phase should update or add focused tests:

- `tests/meltdownHttpPolicy.test.js` for direct facade allowlists and raw event
  rejection.
- `tests/runtimeManager.test.js` for admin/public facade allowlists,
  permissions and app-origin limits.
- `tests/appLoaderBoundary.test.js` for app bridge read/write restrictions.
- `tests/uiArchitectureBoundaries.test.js` for browser zone boundaries and
  migration away from raw event construction.
- Browser client tests for the shared facade client and error-code propagation.
- HTTP integration tests for `/api/meltdown` and `/api/meltdown/batch` when
  transport behavior changes.

## Recommended First Change

Start with Phase 1 and Phase 2. Do not start by adding new REST routes or
rewriting module events.

The first facade client and public runtime migration are in place. The next
safest change is to keep migrating any newly touched browser helper to the
shared facade utilities, then split Runtime Manager maps by domain once the
error shape and action inventory are stable.
