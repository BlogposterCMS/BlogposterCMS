# Design Studio Agent Feedback

Design Studio must remain agent-readable through the existing
AgentManager/AppLoader `agentSurface` contract. The canonical browser-side
adapter is `ui/designer/app/agentSurface.ts`; do not create a parallel
Designer-only agent API for the same state.

## Snapshot Contract

Every Design Studio snapshot should include the `feedback` block at the top
level, in `state.feedback`, and a compact `meta.agentFeedback` summary. The
current channel name is `design-studio.agent-feedback`.

The feedback block is versioned and should expose:

- `layoutTree`: stable container ids, parent ids, workarea flags, layout mode,
  `designRef`, Style Source metadata and visible bounds.
- `widgetPlacements`: stable widget instance ids, widget ids, scene/workarea
  ids, selection, behavior, ranges, effects, Style Source metadata and visible
  bounds.
- `styleSources`: source, follower and disabled relationships for containers
  and widget placements.
- `selection`: selected object id, widget id, scene id, behavior/range/effect
  data and visible bounds.
- `snapGuides`: whether object, canvas and equal-spacing snap guides are
  enabled, whether live movement uses magnetic snapping, current active guide
  count, tolerance, source ids, spacing distance and transient guide bounds
  while a drag is in progress.
- `livePreview`: whether the public-page Runtime preview frame is open, which
  viewport it renders, its frame URL and whether it is loading, ready or in an
  error state.
- `publishing`: whether the Publishing panel is available/open, its active slug,
  usage status, page usage count, published-bundle state and visible usage
  entries.
- `viewport` and `visual`: viewport size, device pixel ratio and optional
  stage-preview metadata.
- `warnings`: searchable `DESIGNER_AGENT_FEEDBACK_*` entries when a structured
  adapter, command port, layout root, bounds signal or visual preview is
  missing.

The snapshot tree keeps the stable `sections` id for compatibility, but the
user-facing label is `Scenes`. These entries represent storyboard-style Design
Studio scenes, not the LayoutTree's structural page sections. The visible
authoring surface for these entries is the canvas storyboard rail; Scene chips
and their rename/reorder/delete controls are exposed as
`scene-storyboard-command` controls so agents do not need to infer them from the
sidebar.
Layer rows expose `widgetInstanceId`, widget id, scene id and `zIndex`
metadata, plus `layer-order-command` controls for the visible forward/backward
stacking actions in the Layers panel.
The header Publish button is exposed as a `publication-center-command`; the
visible Publishing panel state is mirrored in the feedback `publishing` block
instead of requiring agents to scrape the sidebar.

The central Color Schemes are exposed beside the feedback block as
`state.colorLibrary` and `meta.colorLibrary`. They include load status, active
scheme identity and stable numbered Default slots with names, values and CSS
token names. The surface action catalog exposes refresh, scheme
create/update/activation/deletion and numbered-slot mutations through the same
core service and permissions as the visible picker. The concrete actions remain
`colorLibrary.refresh`, `colorLibrary.create`, `colorLibrary.update`,
`colorLibrary.delete`, `colorLibrary.createScheme`,
`colorLibrary.updateScheme`, `colorLibrary.activateScheme` and
`colorLibrary.deleteScheme`.

Reusable typography is exposed separately as `state.fontPackages` and
`meta.fontPackages`. The state includes package count, active package identity,
the active semantic role settings and load errors. The action catalog exposes
`fontPackages.refresh`, `fontPackages.create`, `fontPackages.rename`,
`fontPackages.updateRole`, `fontPackages.resetRole`, `fontPackages.activate`
and `fontPackages.delete`. These commands use the same Font Packages core
module and permissions as the visible sidebar editor. Direct per-text font
overrides remain valid; an empty inline font family means the active package
default.

Declarative Builder packages are exposed separately as `state.sitePresets` and
`meta.sitePresets`. The state distinguishes installed and user-created packages,
includes the last applied preset, and uses command actions for refresh, apply
and user-preset deletion. Applying a package refreshes the central Color Scheme
and Font Package state; it never introduces a separate runtime or agent API.

## Contributor Checklist

- If a Design Studio change alters canvas rendering, layout containers, widget
  placement, Style Source behavior, selection, save/publish state or visual
  preview behavior, update `ui/designer/app/agentSurface.ts` in the same change.
- Keep writes command-based through AgentManager/AppLoader actions. Do not
  expose every internal renderer function as an agent command.
- Prefer stable ids and typed payloads over UI copy. Bounds must describe what
  the author can see, so an agent can compare the structured contract with the
  optional preview image.
- When a command family is missing, add a clear warning or doc note instead of
  hiding the gap behind DOM scraping.
- Update `tests/designerAgentSurface.test.ts`, this guide and
  `docs/modules/designer.md` whenever the feedback contract changes.

## Agent Usage

Controllers can inspect Design Studio through `/admin/api/agent` surface
context endpoints or through the app-published snapshot carried by the
`agentSurface` bridge. The useful fields are `feedback`, `state.feedback`,
`meta.agentFeedback`, `visual`, `actions` and `selection`.

The browser helper installed by the surface is `window.blogposterAgent.designer`.
Its paired control helper is `window.blogposterAgent.designerControl`; both use
the shared agent-surface client rather than private Designer transport.
