# Design Studio Agent Feedback

Container `settings.height` accepts `auto` or 1–10000px and is independent of
`minHeight`, which still sets the lower bound. The inspector exposes Auto/Fixed
height; shared presentation CSS retains the explicit value after CanvasGrid
updates. `settings.position` accepts normal/sticky. Sticky uses top:0 inside its
parent; the inspector/agent setter rejects Sections, content hosts, Free parents,
clipping/scrolling structural ancestors and containers without vertical travel
room. Availability is rechecked on command, and exposed as `positionAvailability`
with reasons. Existing saved Sticky can cease moving if its parent becomes too
short; inspect current availability after layout changes.

Viewport Fixed is deliberately disabled: the scaled canvas currently has no
matching viewport-bound Container adapter. It is not silently converted to Pin
or a widget effect. Disabled position buttons remain focusable (`aria-disabled`)
and show their reason on hover/focus, with accessible descriptions. There is no
global tooltip service; these controls follow the existing local Designer CSS
tooltip pattern. This change does not replace widget motion or add a parallel
scroll-position engine.

The canvas no longer renders the floating Scenes/storyboard strip. Section
selection and ordering remain in the existing sidebar, and Section-edge add
controls remain on the canvas. Saved Section ids, composition, and existing
`scene.*` agent commands retain their contract; this removes duplicate editor
chrome rather than deleting page sections or introducing a new hierarchy.

The Studio toolbar (`#builder-header`) explicitly resets page-header maximum
width and margins. Its window width is independent of the saved canvas viewport;
this is editor chrome only and does not change authored header geometry or the
existing agent viewport contract.

Container borders use the existing `layoutTree.settings` contract:
`borderWidth` (0–64px), `borderStyle` (none/solid/dashed/dotted/double),
`borderColor` and `borderRadius` (0–512px). The Content inspector edits these
through `container.settings.set`; the shared normalizer and DOM adapter retain
them through save/load, linked copies and public rendering. A positive width
automatically enables a solid border if the line style was unset or none.
`borderTopWidth`, `borderRightWidth`, `borderBottomWidth` and `borderLeftWidth`
override the shared width independently (0–64px). Unset sides inherit
`borderWidth`; explicit zero removes that edge. The overall Width control resets
all four sides. Color and line style are shared. A right-only Aside separator
uses overall Width 0 and Right 1 (or more), with Solid selected.

Auto-row containers with Stretch alignment release CanvasGrid's fixed child
height in both Studio and public rendering. The saved min-height remains a
minimum; the Aside stretches to the neighboring content column above the Footer.
Clicking menu content selects the widget; `Select parent · docs-demo-sidebar`
selects its structural Aside and exposes the border controls.

`Select parent` moves from a widget to its containing box, then outward to the
owning Section, stopping before the page root. It changes selection only; it
does not move the Aside or alter the saved layout hierarchy. Hover marks only
the nearest Container and clears over inactive scope overlays or on exit.
`hoveredContainerId` and the four border values are available in the existing
agent feedback snapshot. Selection and hover outlines are editor decoration,
separate from the authored border and excluded from document serialization.

Saved thumbnails now use a first-Section top crop independent of editor zoom.
The snapshot exposes `layoutTree.pageFlow.savedThumbnail` capture metadata;
the separate agent stage-preview continues to describe the current stage.

Public first-response articles remain visible and styled while layout widgets
load. The shared document renderer adopts the existing sanitized article into
the saved content host before mounting asynchronous widgets; nested page designs
retain their own content-slot ownership. This does not change Studio selections,
saved geometry or its agent contract. The optional Docs example uses the same
document tree, native navigation settings and content-host feedback as any design;
its import commands belong to the Pages surface (see [example workflow](docs-example.md)).

Canvas links select their widget while editing and navigate in Preview. Inspector
controls retain that selection even when the scaled canvas extends behind them;
the same selected instance remains the target of agent configuration actions.

Shared page layouts use `feedback.layoutTree.pageContent`: stable `hostIds`,
single-host readiness, Settings/Pages assignment ownership and site-main defaults.
`modes`, `accepts`, `composition` and `assignmentSurface` describe the content
outlet. `pages.setMainDesign` on the Pages surface chooses the website frame;
`page.setLayout` on the page editor chooses `main`, `composed` or `design`.
The persistent `isDynamicHost` flag is separate from active `workarea` selection.
Auto/Grid ancestry lets article content grow through the same public/preview
renderer; Free ancestors produce
`DESIGNER_AGENT_FEEDBACK_CONTENT_HOST_FREE_ANCESTOR`. Multiple saved hosts produce
`DESIGNER_AGENT_FEEDBACK_CONTENT_HOST_AMBIGUOUS`. A full-page design need not have
a content host; readiness is descriptive, not a blanket publication blocker.

The UI kit uses existing Site Presets. `sitePresets.export` reads portable JSON
as bounded base64 `jsonParts`, preserving it through existing transport limits;
`sitePresets.import` creates a validated kit and does not apply it. Existing
revision/draft guards cover kit-name and JSON inputs. Shared color/font apply
and demo replacement retain their existing commands and confirmation contracts.
See [UI kits](site-presets.md) and [page composition](layout_templates.md).

Widget module loading resolves an allowlisted same-origin URL against the
document base before importing from an embedded/blob-loaded Studio bundle.
Import failures retain the existing `WIDGET_RUNTIME_IMPORT_FAILED` diagnostics.

Imported Section/Container trees hydrate before navigation reconciliation. Their
stable node ids remain present after save/reload; nested widget pointer events
do not select or drag ancestor Containers. Imported page bounds can shrink again
after switching from a taller captured viewport.

Measured HTML imports keep provenance in widget metadata. The shared inline
renderer projects the bounded `htmlImport` record onto the ordinary canvas
item; `feedback.widgetPlacements[].htmlImport` exposes its source ID, kind,
captured widths, parent Container ID, owning Section ID and warning codes. The
existing recursive layout tree exposes imported Sections and nested Containers.
A malformed record reports
`DESIGNER_AGENT_FEEDBACK_HTML_IMPORT_INVALID`. Existing selection, text update,
geometry, save and preview actions remain authoritative. Capture preparation
is a local CLI operation; there is no new Designer-only import transport.
The existing placement `zIndex` reflects the saved visual stack after loading;
the active editing layer is separate and is not a replacement for that value.
Container `placement.zIndex` is preserved by the canonical LayoutTree/DOM
adapter. Nested placement uses the owning container width while breakpoint
selection continues to use the authored page viewport.

Widget content rendering now delegates to the same module lifecycle and inline
content helpers as the public runtime. The existing `agentSurface` remains the
feedback authority: instance ids, selection, bounds and saved placements retain
their contract. Widget load/render failures appear on the canvas as
`.widget-runtime-message[data-error-code]` using existing `WIDGET_RUNTIME_*`
codes, including asynchronous render failures. These DOM diagnostics are not a
new agent action or a substitute for the structured snapshot. Changes to render
ownership must retain Studio editable registration and text selection helpers.

Widget rendering no longer waits for the unused `widgets.registerUsage` call.
The agent surface still reports actual widget placements, selections and render
warnings through its existing snapshots; API dependency metadata does not grant
permissions. Canvas state, command adapters and module ownership are unchanged.

Design Studio must remain agent-readable through the existing
AgentManager/AppLoader `agentSurface` contract. The canonical browser-side
adapter is `ui/designer/app/agentSurface.ts`; do not create a parallel
Designer-only agent API for the same state.

## Snapshot Contract

Menu/Breadcrumb placements expose flat `navigation` settings, `sourceOwner` and
`customItems` from the same serialized widget metadata as Save. The guarded
`navigation.configure` action calls the same instance-settings writer as the
Content inspector. Menu-link authoring remains in Navigation Studio; no second
Designer menu store is introduced. See [navigation authoring](designer-navigation.md).

The shared handoff state is `state.collaboration`: actual draft dirty state,
save/publication busy and error state, current document, selection and
`stateRevision`. All domain writes require that revision as `expectedRevision`;
an existing draft requires `acceptDraft: true`. Publication/deletion also require
the catalog's explicit confirmation flag. Follow
[the CMS handoff protocol](agent-cms-workflows.md), including re-reading after
errors. `DESIGNER_AGENT_FEEDBACK_UNSAVED_DRAFT`, `_OPERATION_PENDING` and
`_OPERATION_FAILED` mirror the real save manager and publish controller.

`collaboration.draftInputs` includes the existing layout-name and scene-inspector
fields in the revision. Typing can precede a field's change handler; a command
based on the earlier value must fail with `CMS_AGENT_STATE_CHANGED` before it
can replace that input. This reader does not own or persist a separate draft.

`design.publish` awaits the same publication promise as the Publish button.
It no longer clicks a control or infers success from a previous success notice.
The editor's manual agent-surface mode retains AppLoader permissions and exposes
only the structured Studio controller, avoiding a duplicate generic DOM path.

The Layout panel inspects the same editable document as widget editing. It does
not activate a second legacy layer or disable canvas pointer events. Saved
standalone designs autosave through the same serialized Designer save command
as manual Save. A new untitled document requires its first explicit Save;
`DESIGNER_AUTOSAVE_FAILED` reports unsuccessful automatic writes.

Layout nodes expose `isDynamicHost` for the persistent page-content destination.
This is separate from `workarea`, which follows the editor's active Section.
Changing scenes must not move the content destination. Runtime mounts attached
content in the outer document's destination and renders `designRef` documents
through the same structural renderer, preserving nested Containers. Recursive
references stop with `RUNTIME_DESIGN_REF_CYCLE_OR_DEPTH` (maximum depth 16).
The existing container host command owns this setting; no separate API is added.
The Section toolbar routes Add container and Use as page content area through
the existing `placeContainer`/`setDynamicHost` handlers. The content-host button
exposes `aria-pressed`; `layoutTree.nodes[].isDynamicHost` is the saved state.
`container.contentHost.set` and `container.designRef.set` call the same layout
handlers as the visible controls. Use stable container ids; `designId: null`
detaches a reusable design. No Designer-only transport is introduced.
Section inspector direction is visible only in Auto, columns only in Grid,
and gap/alignment only in Auto or Grid. `layoutTree.nodes[].settings.mode`
remains the authority; invisible controls must not suggest extra Free rules.

Public gallery navigation preserves widget placement ids and bounds contracts.
The slider track is clipped inside its own viewport; controls sit outside it.
Fade slides expose `aria-hidden`/`inert`, and dot selection uses `aria-current`.
The existing `livePreview` adapter remains the preview authority. Per-slide
playback is not a separate agent command family; no parallel gallery API exists.

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

Normal published pages now mark `data-bp-public-layout-ready="true"` when their
initial HTML/layout structure is present in the response. This is not a paint
or widget-data completion signal. Continue using `bp:public-widgets-ready` and
the established surface feedback for hydrated widget inspection. Signed Designer
Canvas `editingScope` reports `layout`, `content`, or `design` (no content outlet).
`contentHostNodeId` identifies the saved `isDynamicHost`, independently of the
active Section. Inactive branches have removable editor overlays; double-click
or Enter selects that editing scope through existing selection handlers. This
does not load or claim to edit another page's content: an empty reusable outlet
remains a placeholder. The surrounding Body Section can own both a navigation
Container and the content-column Container. Selection bounds describe that
parent structure, not a separate content document.
The inspector resolves a selected nested Container before its owning Section;
layout settings and subsequent insertions target that Container. Its stable node
ID is shown read-only instead of exposing the parent Section's rename field.
Nested selection shows only that Container boundary; the parent Section outline
is suppressed while it contains the selected Container.
Canvas CSS preserves Section height and Auto/Grid article flow in parity with
the public renderer. Structural containers no longer inherit legacy centering.

Designer startup runs independent presentation reads concurrently through the
existing bridge and waits for them before rendering the canvas. Agent surface
registration and `designer-ready` remain after builder initialization.

Signed Live Preview boots the existing public shell independently of published
pages, including server render mode. Only the edited design ID is overridden
by the draft payload; nested references keep the public lookup contract.
The navigation widget currently uses a direct public HTTP read outside Studio;
in the nested opaque-origin preview this can fail with
`BP_WIDGET_NAVIGATION_LOAD_FAILED` while the outer render reports ready.
A public navigation adapter through the existing Runtime/AppLoader contracts
is still missing; do not substitute admin navigation data or weaken the sandbox.
The browser also reports AppLoader rejecting `cmsPublicRuntimeRequest` from
Designer, so referenced public reads/breadcrumb hydration are not yet end-to-end
verified even when the outer preview reports ready.

Live Preview does not consume `BP_PUBLIC_BOOTSTRAP`; its parent-bridge payload
and existing agentSurface remain authoritative. Server and browser share public
canvas geometry, so this startup change does not add a Designer-only API.

Controllers can inspect Design Studio through `/admin/api/agent` surface
context endpoints or through the app-published snapshot carried by the
`agentSurface` bridge. The useful fields are `feedback`, `state.feedback`,
`meta.agentFeedback`, `visual`, `actions` and `selection`.

The browser helper installed by the surface is `window.blogposterAgent.designer`.
Its paired control helper is `window.blogposterAgent.designerControl`; both use
the shared agent-surface client rather than private Designer transport.

Collection archive cards retain their stable item and Style Source identifiers.
Cards with rejected/missing URLs have no action link; this does not change widget
placements or the agent snapshot contract.
## Viewport editing and zoom

Designer inspector controls use the shared `customSelect` and `createTabSystem`
components and shared checkbox styles. Enhancement is explicitly scoped to
`data-ui-controls` roots; authored canvas forms are excluded. Container controls
are organized as Layout (geometry/content host), Appearance (background/borders)
and Behavior (scroll position). Widget content controls retain the Content tab.
Existing field selectors, selected container ids and agentSurface settings/actions
remain authoritative; moving a field between panels does not change its owner.
The canvas Section toolbar labels its owner and remains a Section action surface.
Inspector tab buttons require an `app-scope` inside the isolated control root
for styling only; the Studio header mounts directly in the iframe document body,
independent of nested control or authored page scopes. Its existing banner and
viewport feedback remain unchanged. Tab buttons use that nested scope
for shared button styles. Legacy widget-corner resize/menu triggers are hidden;
the existing selected-element action bar, inspector and agent actions remain
the interaction surfaces. This does not change selection or placement contracts.
The selection toolbar Duplicate action invokes the same command as the widget
options menu; it does not introduce a second clone or persistence implementation.
Double-clicking an inactive-layer widget calls the existing layer switch, then
resolves its instance id again before selection. The existing active-layer and
selected-object feedback remains authoritative; failures use
`DESIGNER_LAYER_ACTIVATION_FAILED`. Preview and content-scope overlays retain
their own interaction rules.
Text editing may temporarily elevate visual z-index but must never change
`data-layer`: interaction locks and agent feedback use that logical layer.
The Layers sidebar includes structural containers and their nested widget rows,
including empty containers. Container background/transparent controls live on the
owning canvas toolbar; the background setting and node id remain the agent contract.
Rows retain node/instance ids matching the existing
layout tree feedback. Internal HTML inside a widget is not a separate layout node.

The existing `viewport.set` and `viewport.preset` commands update every Section
and nested Container grid. `viewport.zoom.set` scales the shared page owner and
does not change the authored viewport or reflow saved placements. Placement rule
selection uses page width; child coordinates use the owning Container width.
Dragging at Mobile (320–600px), Tablet (601–1024px), or Desktop (1025–3840px)
records the existing responsive range, with the selected widget's explicit
range controls available for narrower or broader corrections. Saved rules remain
in `code.meta.responsivePlacement`; switching widths alone does not author a rule.


Unavailable catalog widgets remain on the canvas with `DESIGNER_WIDGET_UNAVAILABLE`
status and retain their saved instance code and placement during subsequent saves.
Their code is not executed while the catalog definition is absent. Restore the
extension registration before previewing its behavior; this status is not a successful render.


Community modules now use the same registration/module mount in the Designer and
public loader. Preview supplies only uncredentialed public reads; mutation/stream
attempts return `WIDGET_SERVICE_DENIED` instead of creating application state.
Saved SQL/Mongo widget reads follow y/x placement order rather than instance-id
alphabetical order, preserving native flow reading order after reload.

Native text edits persist in metadata (including the active translation), so save
and reload keep the module stylesheet. Container padding accepts bounded CSS box
shorthand. Stacked sections retain intrinsic size rather than legacy split flex
weights; explicit split alignment and single-edge borders render consistently.
These are existing layout settings exposed through the same agent snapshot.
## Website branding, theme and logo feedback

The existing widget catalog and placement snapshots identify the Media logo as
`siteLogo`. It uses the regular widget insertion and sizing actions. Logo URLs
belong to Settings → Design → Branding, not instance metadata or Style Source.
The rendered element exposes `data-logo-variant` and `BP_WIDGET_LOGO_*` errors;
changing branding uses the existing Settings actions, with no Designer-only API.

The canonical Color Library feedback `defaultSlots` includes optional `darkValue`
(null means inherit light). The existing scheme/slot ids and update action remain
authoritative. Shared Settings/Designer visual rows expose stable
`data-design-token-id` values; selected-kit previews do not activate the kit.
See [Website branding and UI kits](website-branding.md) for JSON/CSS ownership,
font/button defaults and the current preview/editor boundary.

## UI kit components: compact agent authoring

`state.sitePresets.components` is the active kit's shallow catalog of
`id/name/type/supported`; `componentKitId` identifies its kit. Full definitions
are deliberately omitted from automatic snapshots. `sitePresets.refresh` returns
compact summaries too; pass `kitId` to inspect another kit's component catalog.
This structure stays within AgentManager's existing depth and array limits.

Use the existing command port through AgentManager:

```json
{"action":"insert.element","params":{"componentId":"primary","props":{"label":"Buy now","href":"/shop"}}}
```

`kitId` is optional and defaults to the applied kit, then `site-preset-default`.
Props merge over the chosen definition. The existing insertion/placement/save path
stores the resolved component in `code.meta.settings.component` and its origin in
`sourcePresetId`; responses report the inserted selection and searchable
`UI_KIT_COMPONENT_*` errors. A missing component/widget or unsupported type fails
explicitly. Native `type` insertion continues to work.

Only when needed, call `sitePresets.component` with `componentId` and optional
`kitId` to get that definition as `jsonParts` (base64 UTF-8). The existing
`sitePresets.import/export` commands handle whole packages. UI list rows and the
generic public `uiKitComponent` widget use the same renderer. No DOM search is
needed to find or insert kit components.

Controls emit `bp:ui-kit-change` with `{componentId,value}` locally. They do not
submit forms or invoke backend actions. A business-form binding adapter and
editing an existing instance's component props are not yet exposed as agent
command families; preserve the existing Forms/service permission boundaries when
adding those adapters. Structural layout remains the Designer container model.
