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

- `layoutTree`: stable container ids, parent ids, canonical Section metadata,
  `gridSurfaceId`, `parentGridSurfaceId`, parent-grid-item state, workarea
  flags, layout mode/settings, Free Placement interaction-lock health,
  `designRef`, Style Source metadata and visible bounds. A newly inserted
  Section temporarily reports its insertion-feedback state and command source.
- `widgetPlacements`: stable widget instance ids, widget ids, scene/workarea
  ids, selection, behavior, ranges, effects, Style Source metadata and visible
  bounds plus exact edit-grid coordinates, z-index and responsive placement
  base/range rules with fixed-pixel geometry.
- `styleSources`: source, follower and disabled relationships for containers
  and widget placements.
- `selection`: selected object id, widget id, scene id, behavior/range/effect
  data and visible bounds.
- `snapGuides`: whether object, canvas and equal-spacing snap guides are
  enabled, whether live movement uses magnetic snapping, current active guide
  count, tolerance, source ids, spacing distance and transient guide bounds
  while a drag is in progress.
- `livePreview`: whether the public-page Runtime preview frame is open, which
  viewport it renders, its exact layout width/height, its separate visual fit
  scale/mode, its frame URL, searchable error code/message and whether it is
  loading, ready or in an error state.
- `motionTimeline`: whether the contextual motion-preview timeline exists and
  is visible, the selected widget instance it describes, its current progress
  and the number of rendered Sticky/Pinned/effect lanes. Footer zoom is not
  part of this contextual visibility state.
- `widgetLibrary`: widget category ids, whether the category rail currently
  overflows, the open category id, popover visibility and the preset ids
  currently visible in that popover.
- `publishing`: whether the Publishing panel is available/open, its active slug,
  usage status, page usage count, published-bundle state and visible usage
  entries.
- `viewport` and `visual`: shared Builder width, preset, zoom and zoom mode, separate
  browser-frame dimensions, device pixel ratio and optional stage-preview
  metadata.
- `warnings`: searchable `DESIGNER_AGENT_FEEDBACK_*` entries when a structured
  adapter, command port, layout root, bounds signal or visual preview is
  missing.

Malformed responsive placement metadata produces
`DESIGNER_AGENT_FEEDBACK_RESPONSIVE_PLACEMENT_INVALID`; the surface keeps the
rest of the snapshot readable and never asks an agent to infer the missing
geometry from DOM scraping.

`DESIGNER_AGENT_FEEDBACK_LAYOUT_GRID_TREE_MISMATCH` reports a Section or nested
Container whose DOM grid ownership no longer matches its structured LayoutTree
parent. Agents should use the stable tree and surface ids instead of deriving
hierarchy from screen position.

`DESIGNER_AGENT_FEEDBACK_FREE_PLACEMENT_LOCKED` reports a Free Placement
surface that still has temporary Auto/Grid movement locks. Explicitly locked
widgets and widgets on inactive layers are not false positives.

For a selected element, `behaviorMap.elements[].cues.stageHud` reports the
Behavior controls embedded in the shared widget action bar. The control is
associated through the stable widget instance id; agents must not infer the
selection from toolbar geometry or DOM overlap.

The snapshot tree keeps the stable `sections` id and the user-facing
storyboard label `Scenes` for command compatibility. Every entry is now a view
of the same canonical LayoutTree Section node: `sceneId`, Section `nodeId` and
widget `workareaId` are identical. Rename, reorder, create and delete commands
therefore mutate the page structure rather than a second scene array. Section
nodes expose placement mode, height, inherited background, `deletable` and the
recursive deletion behavior. `scene.delete`, the storyboard action and the
Section-owned toolbar all remove the canonical Section together with its
Container/widget subtree; the last Section returns
`DESIGNER_SECTION_DELETE_LAST_SECTION` and remains intact. A
`DESIGNER_AGENT_FEEDBACK_SECTION_STRUCTURE_MISMATCH` warning reports missing
Section nodes or widget workarea ids that do not resolve to one.
An empty Section still exposes its storyboard state and quick-insert affordance
after LayoutTree hydration. Scroll and Action sidebar controls are one-shot
shortcuts: their pressed state may clear while the selected widget's persisted
behavior remains available through `selection` and `behaviorMap`.
Adding a Section through its lower-edge control, the storyboard or
`scene.add` uses the same canonical insert command. During the short visual
reveal, `layoutTree.nodes[].section.insertionFeedback` reports `entering`, the
source and whether the feedback is visible; it returns to `idle` afterwards.
The active Section's complete editor-only boundary is represented by
`layoutTree.nodes[].section.boundaryVisibility` and the matching Section-tree
metadata. The value is `all-sides` only for the active Section and `hidden`
otherwise. `boundaryPresentation=filigree-fade` describes the visual treatment;
`contracts.activeSectionBoundaries` and
`contracts.activeSectionBoundaryTransition` declare support.
`toolbarPlacement=top-right-inset` identifies the Section-owned controls as
inside the authored surface rather than sharing its insertion edge;
`contracts.sectionToolbarInsetPlacement` declares support.
`resizeHandle=bottom-edge` and
`resizeInteraction=zoom-invariant-authored-pixels` identify the Section resize
surface and confirm that screen-pointer movement is converted back into
authored canvas pixels. `contracts.sectionResizeZoomInvariant` declares the
same guarantee at the snapshot level.
`contracts.placementModeIndependentWidgetSelection` confirms that widgets on
the active layer remain selectable in Free, Auto and Grid surfaces even when
the latter modes correctly disable free dragging and resizing.
The page remains one vertically flowing white canvas. `layoutTree.pageFlow`
reports the vertical axis, content-driven root height and canonical Section
count so agents do not mistake the grey editor surround for a Section surface.
Rich Text semantic roles remain content metadata inside the stable `textBox`
widget instance. Heading and paragraph entries are insert presets only; the
visible text toolbar can change the active block tag without changing the
selection's widget id. The role change removes block-level font overrides so
the active Font Package role is applied immediately, while nested inline
formatting remains intact. Agent integrations should read or update the
existing text HTML contract rather than infer a separate Heading widget type.
Layer rows expose `widgetInstanceId`, widget id, scene id and `zIndex`
metadata, plus `layer-order-command` controls for the visible forward/backward
stacking actions in the standalone left-rail Layers panel. Container rows nest
their direct child rows and order actions affect siblings only. The right
Properties sidebar owns widget Content, Behavior and Style controls; this
visual separation does not change the stable `layers` snapshot tree or command
ids.
The header Publish button is exposed as a `publication-center-command`; the
visible Publishing panel state is mirrored in the feedback `publishing` block
instead of requiring agents to scrape the sidebar.
Widget categories remain `insert-group` controls for command compatibility,
with `meta.presentation=widget-rail-popover`; each concrete choice is also
published as an `insert-preset-command`. The feedback
`contracts.widgetPresetPopovers` flag and `widgetLibrary` state let agents
understand the visible rail/popover relationship without inferring it from
geometry or DOM nesting.

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
includes the last applied preset, and uses command actions for refresh,
current-state creation, apply and user-preset deletion. Applying a package
refreshes the central Color Scheme and Font Package state; it never introduces
a separate runtime or agent API.

## Command Families

All writes first use `window.blogposterDesignerCommands.execute` and stay
behind the existing AgentManager/AppLoader command transport:

- `viewport.set`, `viewport.preset`, `viewport.zoom.set`
- `scene.add`, `scene.select`, `scene.update`, `scene.move`, `scene.delete`
- `insert.element`, `element.select`, `element.update`,
  `element.geometry.set`, `element.move`, `element.resize`,
  `element.responsiveRange.set`,
  `element.zIndex.set`, `element.duplicate`, `element.delete`
- `text.update`, `behavior.set`, `range.set`, `effect.set`
- `container.create`, `container.duplicate`, `container.move`,
  `container.delete`,
  `container.mode.set`, `container.settings.set`,
  `container.styleSource.link`, `container.styleSource.unlink`
- `design.save`, `design.publish`
- `sitePresets.refresh`, `sitePresets.create`, `sitePresets.apply`,
  `sitePresets.delete`

The geometry contract uses the same edit-grid units returned as
`widgetPlacements[].grid`. `widgetPlacements[].responsivePlacement` identifies
the fixed-pixel base geometry, the active viewport rule and every named width
range. `fitsViewport` reports whether the active fixed width fits completely;
a wider element is expected to overflow symmetrically until an author or agent
adds a smaller width-range override. Legacy percentage bounds remain available
for compatibility. Empty direct `fontFamily` or `color` values restore the
active Font Package or Color Scheme default.

Selection outlines and resize handles are presentation-only. Their hit targets
may be refined without changing the stable selected-object ids, grid geometry
or visible `bounds` exposed through the existing feedback contract.
An empty Section-background pointer clears the selected widget, its owning grid
selection and contextual action bar as one operation. The resulting snapshot
therefore reports no stale selected object; support is declared through
`contracts.sectionBackgroundDeselectsWidget`.
Canvas scrolling hides the floating widget action bar and its stage HUD without
discarding the structured selection. The
`contracts.widgetActionBarHidesOnCanvasScroll` capability distinguishes this
temporary chrome state from a real deselection.

The `scene.*` command names are retained as a compatibility family. Their
targets and results are canonical Sections, not an independent scene model.

`element.duplicate` and `container.duplicate` accept an optional `linked`
boolean. The default creates a fully independent copy. `linked: true` performs
the same one-time content/structure copy and then creates explicit Style Source
relationships for corresponding objects; it does not synchronize later
structure changes. `container.styleSource.link` always requires an explicit
`sourceId` and never guesses a sibling.

When sandboxed cross-origin stylesheets prevent a pixel capture, the agent
surface publishes a same-document PNG structure preview drawn from stable
element bounds and labels. This stays inside AgentManager's raster image
allowlist; Design thumbnails still fail closed instead of substituting that
diagnostic image.

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
