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
- `viewport` and `visual`: viewport size, device pixel ratio and optional
  stage-preview metadata.
- `warnings`: searchable `DESIGNER_AGENT_FEEDBACK_*` entries when a structured
  adapter, command port, layout root, bounds signal or visual preview is
  missing.

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
