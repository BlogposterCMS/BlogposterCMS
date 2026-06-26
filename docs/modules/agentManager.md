# agentManager

`agentManager` is the central runtime contract for agent-visible and
agent-controllable app surfaces. It is a core module under
`mother/modules/agentManager` and is loaded during server startup.

The module is intentionally system-wide. Studio/Designer is only one consumer:
any app can publish a surface snapshot and poll commands through the same
contract when it opts into `agentSurface`.

## Contract Files

- `mother/modules/agentManager/moduleInfo.json` describes the module.
- `mother/modules/agentManager/apiDefinition.json` is the machine-readable API
  contract. It lists events, access level, permissions, payload fields,
  surface fields and command lifecycle states.
- `agent.getApiDefinition` returns that same contract at runtime so tools do
  not need to parse repository files.

## Admin HTTP Facade

The same central contract is also available to authenticated admin tooling at
`/admin/api/agent`. The facade is intentionally thin: it validates the admin
token, builds an AgentManager payload and forwards to the central events.

Useful routes:

- `GET /admin/api/agent/definition`
- `GET /admin/api/agent/context`
- `GET /admin/api/agent/activity`
- `GET /admin/api/agent/surfaces`
- `GET /admin/api/agent/surfaces/:appName/:surfaceId/context`
- `GET /admin/api/agent/surfaces/:appName/:surfaceId/inspect`
- `GET /admin/api/agent/surfaces/:appName/:surfaceId/preview`
- `GET /admin/api/agent/surfaces/:appName/:surfaceId/preview/image`
- `GET /admin/api/agent/surfaces/:appName/:surfaceId/actions`
- `GET /admin/api/agent/surfaces/:appName/:surfaceId/commands`
- `POST /admin/api/agent/surfaces/:appName/:surfaceId/commands/validate`
- `POST /admin/api/agent/surfaces/:appName/:surfaceId/commands`
- `POST /admin/api/agent/surfaces/:appName/:surfaceId/commands/observe`
- `POST /admin/api/agent/surfaces/:appName/:surfaceId/workflows/validate`
- `POST /admin/api/agent/surfaces/:appName/:surfaceId/workflows`
- `POST /admin/api/agent/surfaces/:appName/:surfaceId/refresh`

Command POST bodies accept either `{ "command": { "action": "..." } }` or a
flat command body. `invoke`, `wait` or `waitForResult` switch the facade from
queueing to `agent.invokeSurfaceCommand`.

Use `commands/observe` or `agent.invokeSurfaceCommandAndObserve` when a
controller wants one response containing the command result, compact surface
context and related activity. It waits by default and supports `observeDelayMs`
for surfaces that publish a fresh snapshot immediately after acknowledging a
command. Set `waitForFreshSnapshot` to wait until the surface publishes a
snapshot revision newer than the one that existed before the command was
queued. `snapshotTimeoutMs` and `snapshotIntervalMs` tune that wait.
HTTP observation responses also include `previewImageUrl`, so visual agents can
fetch the latest rendered surface image after a command.

Use `refresh` or `agent.refreshSurface` when a controller only needs the latest
agent-visible surface state. It requests the standard `surface.refresh` action,
waits for a fresh snapshot by default and returns the same observation bundle,
including `previewImageUrl`.

Use `inspect` or `agent.inspectSurface` when a controller wants the current
agent-ready surface bundle in one read: compact context, preview metadata,
advertised actions, recent activity and the HTTP preview image URL.

Use `workflows` or `agent.invokeSurfaceWorkflow` when a controller needs to run
a bounded sequence of surface commands through the same central validation and
observation path. Each step is validated against the surface action catalog and
returns its own observation. HTTP workflow responses include `previewImageUrl`
on the workflow and on step observations. `haltOnFailure` defaults to true.

Use `commands/validate`, `workflows/validate`,
`agent.validateSurfaceCommand` or `agent.validateSurfaceWorkflow` to preflight
agent plans without changing surface state. Validation reports unsupported
actions and missing required params, but it does not enqueue commands.

Use `preview?includeData=true` when a controller or development tool needs the
latest visual preview data URL without fetching the full snapshot or command
context. Without `includeData`, the route returns metadata such as dimensions,
freshness and preview availability only.

Use `preview/image` when a browser or visual verifier needs the current preview
as an image response. The route is authenticated like the JSON facade, returns
`image/png`, `image/jpeg` or `image/webp`, and is served with `Cache-Control:
no-store`.

Shared browser/tooling code can use
`ui/shared/agent/agentHttpClient.ts` to call this facade directly.

## Browser Console Helper

Admin pages load `/build/agentConsole.js`, which installs
`window.blogposterAgentConsole`. It is a thin development helper around the
central HTTP facade, not a Designer-specific API.

Examples:

```js
await window.blogposterAgentConsole.inspect()
await window.blogposterAgentConsole.designerValidate('scene.select', { sceneId: 'features' })
await window.blogposterAgentConsole.designerPreview()
window.blogposterAgentConsole.designerPreviewImageUrl()
await window.blogposterAgentConsole.designerRefresh()
await window.blogposterAgentConsole.designer('scene.next')
await window.blogposterAgentConsole.designerValidateWorkflow([{ action: 'scene.next' }])
await window.blogposterAgentConsole.designerWorkflow([{ action: 'scene.next' }])
await window.blogposterAgentConsole.run('designer', 'studio.designer', 'scene.select', { sceneId: 'features' })
```

`designer()` and `run()` default to `waitForFreshSnapshot: true` so interactive
debugging returns a post-command surface revision when the surface publishes
one.

`refresh()` and `designerRefresh()` enqueue the standard `surface.refresh`
action through `agent.refreshSurface`. It asks the surface to publish a fresh
snapshot and visual preview without changing domain state. Shared surface
clients publish the follow-up snapshot with reason `refresh`.

## Activity

AgentManager keeps a bounded in-memory activity trail for development tools
and controllers. It records:

- `surface.snapshot`
- `command.queued`
- `command.delivered`
- `command.acked`
- `command.failed`

Use `agent.listActivity` or `GET /admin/api/agent/activity` with filters such
as `appName`, `surfaceId`, `type`, `commandId`, `since` and `limit`.

## Core Events

Read events:

- `agent.getCapabilities`
- `agent.getApiDefinition`
- `agent.getSystemContext`
- `agent.listSurfaceSnapshots`
- `agent.getSurfaceSnapshot`
- `agent.getSurfaceContext`
- `agent.getSurfacePreview`
- `agent.inspectSurface`
- `agent.listSurfaceActions`
- `agent.getSurfaceAction`
- `agent.validateSurfaceCommand`
- `agent.validateSurfaceWorkflow`
- `agent.listActivity`
- `agent.listSurfaceCommands`
- `agent.getSurfaceCommand`
- `agent.waitForSurfaceCommand`

Surface-owned write events:

- `agent.publishSurfaceSnapshot`
- `agent.pollSurfaceCommands`
- `agent.ackSurfaceCommand`

Control write events:

- `agent.enqueueSurfaceCommand`
- `agent.invokeSurfaceCommand`
- `agent.invokeSurfaceCommandAndObserve`
- `agent.refreshSurface`
- `agent.invokeSurfaceWorkflow`

The split matters. App-owned surfaces may publish snapshots and consume their
own queued commands, while agent controllers enqueue or invoke commands through
the central manager.

## Boundaries

`agentManager` is a core module and the only backend authority for
agent-visible surface state and queued surface commands. Apps and widgets do
not mutate core state directly. They publish bounded snapshots, advertise the
actions they are willing to handle, poll their own queued commands and
acknowledge results through the events above.

All surface payloads are normalized at the boundary. App names, surface ids,
actors, action names and command ids are scalar tokens; object-shaped ids are
rejected. JSON-like fields such as `summary`, `state`, `selection`, `tree`,
`controls`, `actions`, `metrics`, `meta`, command params and command results
are depth-, size- and array-limited. Unsupported values are dropped, control
characters are stripped from strings and unsafe object keys such as
`__proto__`, `constructor` and `prototype` are discarded before data is stored
or returned.

Visual previews are metadata-first. Inline image data is accepted only for
bounded `data:image/png`, `data:image/jpeg` or `data:image/webp` payloads and
is omitted from compact contexts unless a caller explicitly requests it.

## Surface Snapshot Model

A surface publishes:

- `appName` and `surfaceId` as stable identity.
- `surfaceType`, `title`, `route` and `url` as human context.
- `summary`, `state` and `selection` as compact agent-readable state.
- `tree` and `controls` as visible structure.
- `actions` as the command catalog the surface is willing to accept.
- `visual` as optional preview metadata. Preview data URLs are omitted from
  compact contexts unless explicitly requested.

Commands are validated against the latest advertised `actions` list before
they are queued. Required action params must be present; unsupported actions
are rejected centrally.

The same validation can be called explicitly before execution. This gives
agents a safe way to check a planned command or workflow against the current
surface contract before mutating the UI.

## Context Freshness

Surface summaries include a `freshness` object with `updatedAt`, `ageMs`,
`stale`, `inactive` and the thresholds used by the manager. This lets a
controller decide whether it is looking at a current UI state before sending
commands.

`agent.getSystemContext` accepts `activeOnly` and `staleOnly` in addition to
app, surface type and surface id filters. Its `counts` include stale and
inactive surface totals for the returned set.

## Frontend Helpers

Shared browser code lives in `ui/shared/agent/agentSurfaceClient.ts`.

- `createAgentSurfaceClient()` publishes snapshots and polls commands.
- `createAgentControlClient()` reads contexts and enqueues/invokes commands.
- `buildDomAgentSnapshot()` captures visible DOM controls into a generic tree.
- `handleDomAgentCommand()` implements generic `dom.*` commands.
- `startDomAgentSurface()` is an opt-in adapter for ordinary app surfaces.

All `createAgentSurfaceClient()` surfaces advertise the standard
`surface.refresh` action automatically. Generic DOM actions are:

- `surface.refresh`
- `dom.click`
- `dom.focus`
- `dom.setValue`
- `dom.toggle`
- `dom.submit`

Apps that need richer behavior should advertise app-specific actions in their
snapshot and handle them in their own command handler.

## App Manifest Opt-In

Apps opt in with:

```json
{
  "agentSurface": true
}
```

or:

```json
{
  "agentSurface": {
    "enabled": true,
    "surfaceId": "settings.main",
    "title": "Settings",
    "surfaceType": "settings-surface"
  }
}
```

`appLoader` expands this manifest flag into the safe agent surface event subset.
Non-core apps can publish/poll/ack their own surface, but they cannot use this
flag to enqueue commands or access arbitrary direct bridge events.

The admin app route writes this manifest value into
`<meta name="app-agent-surface">`. `appFrameLoader` forwards it in the
`init-tokens` postMessage. The shared app bridge then starts
`startDomAgentSurface()` inside the iframe.

## Security Notes

- Agent surface opt-in is explicit; ordinary apps are not made controllable
  automatically.
- Raw `agent.*` events are blocked at the generic `/api/meltdown` adapter.
  Admin tooling must use `/admin/api/agent`; app surfaces use the
  manifest-gated `agentSurface` bridge.
- App iframes still do not receive the admin token. The parent-side bridge
  injects the validated principal server-side through `appLoader`.
- Non-core apps get only the agent surface event subset through direct bridge
  calls. Control-side events such as `agent.enqueueSurfaceCommand` remain
  central controller operations.
- For non-core app surface calls, AppLoader overwrites any app-supplied
  `appName` with the validated app identity before forwarding to AgentManager.
  Apps can name their own `surfaceId`, but they cannot publish, poll or ack as
  another app.
- `agentManager` sanitizes JSON-like snapshot and command data, limits array
  and object sizes, truncates long strings and caps visual preview payloads.
- Snapshot preview data is available only through full snapshot or explicit
  context/preview options, not by default in system context.

## Studio Integration

Designer publishes a richer `studio-builder` surface from
`ui/designer/app/agentSurface.ts`. It advertises scene, element, behavior and
timeline actions while still using the same central `agentManager` event
contract as generic apps.

The Studio snapshot includes `state.behaviorMap` so controllers can read the
builder like a structured scene model instead of scraping UI text. It contains
the active scene id, behavior/effect counts, selected element id, active-scene
element ids and per-element behavior data. Each element entry includes the
normalized behavior, scroll range, enabled timeline effects, stage bounds and
visible behavior cues. Section and layer tree nodes also expose compact
behavior metadata, while `selection` mirrors the selected element range,
effects, effect count and bounds.
