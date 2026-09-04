# Design QA: Design Studio widget rail and preset popovers

## Evidence

- Source visual truth:
  - `C:\Users\Matteo\AppData\Local\Temp\codex-clipboard-9b0ba4a4-e53b-4ebd-971e-671cc6325ebc.png`
    (311 x 164 px; the grouped scrolling flyout that must be replaced).
  - `C:\Users\Matteo\AppData\Local\Temp\codex-clipboard-d45c446f-4a05-4e77-b13f-9495d20f2118.png`
    (248 x 198 px; the required Button preset popover).
- Browser-rendered implementation:
  - `C:\Users\Matteo\.codex\visualizations\2026\07\25\019f98eb-ff8f-7a63-aa5f-146a2b0eb4dd\designer-widget-popover-final.png`
    (1137 x 640 px normalized full view).
  - `C:\Users\Matteo\.codex\visualizations\2026\07\25\019f98eb-ff8f-7a63-aa5f-146a2b0eb4dd\designer-widget-popover-focus-final.png`
    (248 x 198 px focused implementation crop).
  - `C:\Users\Matteo\.codex\visualizations\2026\07\25\019f98eb-ff8f-7a63-aa5f-146a2b0eb4dd\designer-widget-popover-comparison.png`
    (504 x 198 px side-by-side comparison; source left, implementation right).
- Route: `http://localhost:3000/admin/app/designer`.
- State: desktop Design Studio, Button widget category selected, Button preset
  popover visible.
- Browser CSS viewport: 1706 x 960 px at device pixel ratio 0.75.
- Density normalization: the in-app browser returned a tiled 2275 x 1280 px
  capture. The top-left 1137 x 640 px viewport was isolated, then the popover
  was cropped to the same 248 x 198 px dimensions as the source.

## Full-view comparison

The normalized full view confirms that the six widget categories now form one
vertical left-rail list. Layout and the Scene behavior controls remain below it
as separate fixed groups. The Button popover is anchored directly to the active
widget category and no grouped widget flyout occupies the rail.

## Focused comparison

The focused side-by-side image compares equal 248 x 198 px regions. Both show
the same Button heading and the same Primary button, Secondary button and Text
link ordering, with equivalent padding, rounded surface, light row fills,
existing icon language and compact visual density. A second focused region was
not required because the structural scroll behavior was measured directly in
the rendered DOM.

## Required fidelity surfaces

- Fonts and typography: existing Design Studio type tokens and weights are
  preserved. The browser capture is slightly softer because of the 0.75 device
  scale, not because of a font or CSS mismatch.
- Spacing and layout rhythm: the popover width is 232 px, its rows and radius
  match the supplied reference, and the category rail uses fixed 40 px controls
  with 8 px gaps.
- Colors and visual tokens: the implementation reuses the current
  `--scene-*` surfaces, borders, ink and shadow tokens; no new palette or visual
  system was introduced.
- Image quality and asset fidelity: all visible icons reuse the existing SVG
  icon assets. No placeholder, CSS-drawn or generated replacement asset was
  introduced.
- Copy and content: Text, Media, Shape, Button, Navigation and Content remain
  the widget categories. Button exposes exactly Primary button, Secondary
  button and Text link; Text exposes Heading, Subheading, Paragraph, Quote,
  List and Caption.

## Interaction and responsive verification

- Button, Text and Content categories each opened their own preset popover.
- Clicking the active Text category again closed the popover and cleared all
  expanded states.
- Clicking Primary button inserted one canvas item (0 -> 1).
- Layout remained clickable after the widget rail was scrolled and opened its
  existing panel while preserving the widget rail scroll position.
- At a constrained 324 px sidebar height, all six widget controls remained
  40 px tall; the widget area measured 145 px client height and 288 px scroll
  height, while Layout and both Scene behavior controls remained visible.
- Browser console check returned no errors or warnings.

## Comparison history

### Iteration 1

- [P2] Widget controls compressed instead of scrolling at a short viewport.
  The rail used a flexible column, so its buttons were allowed to shrink.
- Fix: added a fixed `flex: 0 0 40px` contract to widget-category controls and
  retained native vertical overflow only on `.scene-widget-scroll`.
- Post-fix evidence: six controls measured 40 px each; the rail measured
  `scrollHeight=288`, `clientHeight=145`, and the Content category became
  reachable at `scrollTop=142.67`. Layout and Scene behavior groups remained
  inside the rail bounds.

## Findings

No actionable P0, P1 or P2 mismatches remain.

## Follow-up polish

- [P3] The focused browser capture is marginally softer than the supplied
  raster reference because the in-app browser rendered at 0.75 device scale.
  This does not affect the live UI or require a product-code change.

Prior widget-rail result: passed

---

# Current follow-up: text opacity popover

## Evidence

- Source visual truth:
  - `C:\Users\Matteo\AppData\Local\Temp\codex-clipboard-4e6da287-28bf-4710-8e6a-50db589fb5b1.png`
    (487 x 104 px; text toolbar with the opacity surface clipped behind the
    canvas).
- Browser-rendered implementation screenshot: unavailable.
- Intended route: `http://localhost:3000/admin/app/designer/1`.
- State: desktop Design Studio, Rich Text selected, text toolbar visible,
  opacity button expanded.
- Source density: approximately 96 dpi. An implementation density comparison
  could not be normalized because no current browser capture was permitted.

## Implementation and interaction evidence

- The opacity surface now mounts in a dedicated fixed body-level popover layer
  with pointer events restored only on the popover.
- Its existing viewport-positioning helper still constrains the 260 px surface
  to the viewport and flips it above the anchor when the lower space is too
  short.
- Focused DOM regression coverage confirms that opening moves the surface out
  of the toolbar's overflow tree and closing restores the exact original DOM
  position.
- Source compilation, Sass compilation and focused tests pass.

## Required fidelity surfaces

- Fonts and typography: the existing toolbar tokens and the 14 px percentage
  label are unchanged.
- Spacing and layout rhythm: the existing 260 px width, 10 x 14 px padding,
  12 px gap and 12 px radius are unchanged.
- Colors and visual tokens: the existing Designer surface, border and shadow
  tokens are unchanged.
- Image quality and asset fidelity: the existing droplet icon is reused; no new
  image asset is involved.
- Copy and content: the existing percentage value is unchanged.

## Blocker

The in-app browser rejected further access to the current localhost route under
its URL policy. The same policy response prohibited using an alternate browser
surface or a raw browser-control workaround, so a post-fix rendered screenshot,
console check and direct slider interaction could not be captured in this run.

final result: blocked

---

# Current follow-up: recursive Section and Container grids

## Source intent

- The user's supplied canvas and toolbar screenshots define the current visual
  language: a compact Section-owned toolbar, Sections appended at the authored
  bottom edge, and Containers that may sit beside free-positioned widgets while
  owning their own child grid.
- Free placement remains the default. Auto and Grid are local modes of the same
  Section or Container surface, not parallel page builders.

## Implementation evidence

- Every canonical Section owns one persistent CanvasGrid.
- Every nested Container is one item in its parent grid and simultaneously the
  CanvasGrid surface for its direct children.
- The single mode icon cycles Free, Auto and Grid; Auto retains its last
  direction.
- Each Section exposes a bottom-edge add control and a drag resize handle.
- Structural reparenting is available only in the Layout tree. The retired
  Arrange-mode wiring is no longer part of the active Designer bundle.
- The standalone left Layers panel renders the same hierarchy recursively and
  orders siblings without mixing Layers into widget properties.
- Public Runtime mounts the same structural Container element as parent item
  and child grid surface through the shared runtime mounting adapter.
- The local authenticated route returned HTTP 200 with the stable browser title
  `Design Studio`.
- Production compilation and the complete Jest suite pass.

## Browser verification boundary

The in-app browser policy blocker recorded above still prevents a fresh,
post-change visual capture of the recursive canvas state. No replacement
browser or raw control workaround was used. The structural result is therefore
verified by compilation, full regression tests and the live route response,
but not claimed as a completed screenshot comparison.

current recursive-grid visual result: blocked

---

# Current follow-up: Free Placement and explicit linked copies

## Implementation evidence

- Switching a Section or Container from Auto/Grid to Free immediately removes
  temporary `gs-no-move` and `gs-no-resize` attributes while retaining explicit
  locks and inactive-layer protection.
- Creating and moving Containers no longer assigns Style Source metadata.
- Widget and Container menus expose `Duplicate` and `Linked copy`; only an
  active follower exposes `Style linked` and `Unlink style`.
- Independent copies receive fresh ids, cloned content data and no Style Source
  metadata. Linked copies receive the same independent content once, then link
  corresponding recursive Container nodes and widget styling. Later structure
  changes are not synchronized.
- Focused Free Placement, shared layout, Container action-bar, widget
  Style Source and widget-menu regressions pass.

## Browser verification boundary

The existing in-app browser policy blocker still prevents a fresh interactive
drag/copy screenshot on the localhost Designer route. No alternate browser or
raw control workaround was used. The follow-up is verified by compilation and
focused interaction/DOM tests. The final production build passed, and the full
Jest run completed with 251 suites and 1207 tests passing.

current Free Placement and linked-copy visual result: blocked

---

# Current follow-up: visible bottom-edge Section insertion

## Implementation evidence

- The existing lower-edge Add Section control remains the only canvas insert
  path and creates the canonical LayoutTree Section immediately after its
  owning Section.
- The inserted Section is scrolled into view, fades in and receives a temporary
  accent outline without changing CanvasGrid geometry.
- Reduced-motion preference replaces movement with a short static
  confirmation.
- Agent feedback exposes the transient insertion state and command source.

## Browser verification boundary

The existing in-app browser policy blocker still prevents a fresh interactive
capture of the localhost Designer route. No alternate browser or raw control
workaround was used. The insertion feedback is therefore verified through
focused DOM tests and the production build, but not claimed as a completed
screenshot comparison.

current bottom-edge Section insertion visual result: blocked

---

# Current follow-up: white flowing Section canvas

## Source evidence

- The supplied Designer screenshots show new Section controls and lower-edge
  add buttons continuing into the grey editor surround while the white authored
  page ends at its initial measured height.
- Section-owned widget/action chrome appears against that grey surround,
  confirming that the structural nodes exist but the shared page zoom target
  no longer grows with them.

## Implementation evidence

- The existing page root remains the only zoom target and now returns to
  content-driven height immediately after CanvasGrid creates its scroll sizer.
- Resize observation resynchronizes the zoom sizer whenever the vertical
  Section stack grows or shrinks.
- Transparent Sections continue to inherit the page background, so the default
  white authored canvas extends while custom page and Section backgrounds keep
  their existing persistence semantics.
- Each Section remains its own positioning context and CanvasGrid; widgets and
  Section chrome therefore move with their owning Section in the page flow.

## Browser verification boundary

The supplied failing screenshot and a fresh post-build browser capture were
compared side by side. The corrected page root is white, content-height driven
and contains all five contiguous Sections. Its rendered height and the zoom
sizer height match, and the eight existing widgets remain owned by the Hero
Section while the newly added Sections stay empty. No browser warnings or
errors were reported.

final result: passed

---

# Current follow-up: canonical Section deletion

## Implementation evidence

- The compact Section-owned toolbar now exposes a dedicated Delete section
  action and the storyboard retains its existing delete action.
- Both UI paths and `scene.delete` use the same canonical deletion function.
- Deletion removes the Section's recursive Container grid ids and all widget
  placements assigned to either the Section or those nested grids.
- A remaining fallback Section becomes active after deletion. The last remaining
  Section cannot be removed and returns
  `DESIGNER_SECTION_DELETE_LAST_SECTION` to agent commands.
- Agent feedback reports Section deletion support, per-Section `deletable`
  state and the recursive deletion behavior.

## Verification boundary

The focused deletion, Section-toolbar, scene metadata and agent-surface
regressions pass, and the production build completes successfully. In the
running Designer, a temporary sixth Section exposed its own Delete section
button; keyboard activation removed it from both canvas and storyboard while
the original five Sections remained. The temporary verification Section was
not left in the document, and Fit canvas was restored.

final Section deletion result: passed

---

# Current follow-up: active Section boundaries

## Implementation evidence

- The active Section draws a two-pixel, editor-only line at all four exact
  authored edges.
- The restrained boundary uses the Studio accent/border token mix and a short
  opacity-and-scale transition instead of a heavy debug-style frame.
- Reduced-motion preferences remove the transition.
- Resizing a Section moves its lower boundary with the real authored height.
- The public page receives no boundary styling.
- Agent feedback exposes `all-sides` only for the active Section and `hidden`
  for every inactive Section.

## Verification boundary

The two focused regression suites pass with 27 tests, and the production build
completes successfully after one transient generated-file lock retry. At Fit
zoom the running Designer renders the selected boundary at approximately
1.33px on every side. Its computed transition uses 160ms opacity and 180ms
scale timing; switching from Hero to Features leaves the former at opacity 0
and the latter at opacity 1.

final active Section boundary refinement result: passed

---

# Current follow-up: stale widget action bar

## Implementation evidence

- Widget deselection now has one reusable action-bar operation that clears the
  selected class, deselection event, owning CanvasGrid and active state.
- Empty Section-background interaction invokes that operation from the
  existing capture-safe pointer path, before CanvasGrid can consume `click`.
- Canvas scrolling hides the floating action bar and its contextual stage HUD
  immediately while retaining the selected widget and inspector state.
- The inspector, contextual behavior controls, Layers rendering and text
  toolbar are cleared with the same selection transition.
- Agent feedback declares the Section-background deselection behavior.

## Verification boundary

The three focused regression suites pass with 32 tests, and the production
build completes successfully. In the running Designer, selecting a widget
shows the action bar and clicking an empty part of its Section changes the bar
from visible to hidden while reducing selected canvas items from one to zero.

final stale widget action-bar result: passed

---

# Current follow-up: Section toolbar placement

## Implementation evidence

- The Add Section button remains centered on the boundary below its owning
  Section.
- The next Section's mode/background/delete toolbar is now inset 20 authored
  pixels from its top and right edges.
- Removing the centered negative transform prevents both controls from merging
  into one ambiguous toolbar.
- Agent feedback reports `top-right-inset` for canonical Sections.

## Verification boundary

The two focused regression suites pass with seven tests, and the production
build completes successfully. In the running Designer the centered Add Section
control remains on the shared boundary at x≈707, while the active Features
toolbar renders separately inside its own top-right inset at x≈844 with
computed `top: 20px`, `right: 20px` and no transform.

final Section toolbar placement result: passed

---

# Current follow-up: Section resize interaction

## Implementation evidence

- Section resize starts from the unscaled authored height rather than the
  transformed visual bounding box.
- Pointer movement is divided by the active canvas scale before updating the
  persisted Section minimum height.
- The bottom-edge hit area and visible thumb counter-scale through the existing
  CanvasGrid zoom contract, so Fit mode does not collapse the control to only a
  few screen pixels.
- Agent feedback declares the zoom-invariant authored-pixel interaction.

## Verification boundary

The two focused suites pass with five tests, the production build succeeds and
the final stylesheet build succeeds. The scaled-pointer regression proves that
a 30-screen-pixel drag at 25% changes the authored height by 120 pixels.
In the running Designer, the active Features Section resized from 320px to
328px and back through the real control. At Fit zoom 28%, its active bottom
handle remains visible with a 20px screen hit area and a 44x3px thumb inset
inside the lower-right edge. No browser warnings or errors were emitted.

final Section resize interaction result: passed

---

# Current follow-up: Widget selection across placement modes

## Implementation evidence

- Auto and Grid continue to apply CanvasGrid move and resize locks.
- Widget selection now runs through a capture-safe Section interaction path
  before CanvasGrid declines those placement gestures.
- The path accepts active-layer widgets and recursive Containers while
  preserving inactive-layer boundaries.
- Agent feedback declares placement-mode-independent widget selection.

## Verification boundary

The two focused suites pass with nine tests. They cover stack, row and grid
selection, inactive-layer rejection and restored Free dragging. The production
bundle also completes successfully after one transient Windows file-lock retry.
In the running Designer, the Hero Section remained in `row` Auto mode while a
click selected `widget-coming-soon-headline` and displayed the
`Selected element actions` toolbar. No browser warnings or errors were emitted.

final placement-mode widget selection result: passed

---

# Current follow-up: unified admin controls and PageList

## Evidence

- Source visual truth:
  - `C:\Users\Matteo\AppData\Local\Temp\codex-clipboard-077565e4-f6d6-4678-b5d2-4f4bbf63b7fc.png`
    (686 x 520 px; General Settings with browser-default fields).
  - `C:\Users\Matteo\AppData\Local\Temp\codex-clipboard-fa48a6fd-4d1b-479f-affd-b17a457dc069.png`
    (537 x 857 px; PageList with native selects, square actions and horizontal overflow).
- Browser-rendered implementation:
  - `C:\Users\Matteo\.codex\visualizations\2026\09\04\01a06c27-1678-77c0-920f-2bda6adc06c3\admin-general-settings.png`
    (859 x 1273 px).
  - `C:\Users\Matteo\.codex\visualizations\2026\09\04\01a06c27-1678-77c0-920f-2bda6adc06c3\admin-page-list.png`
    (859 x 1273 px).
  - `C:\Users\Matteo\.codex\visualizations\2026\09\04\01a06c27-1678-77c0-920f-2bda6adc06c3\admin-page-list-dropdown.png`
    (859 x 1273 px; custom Parent dropdown open).
  - `C:\Users\Matteo\.codex\visualizations\2026\09\04\01a06c27-1678-77c0-920f-2bda6adc06c3\admin-general-settings-comparison.png`
    and `admin-page-list-comparison.png` (source and implementation paired).
- Routes: `http://localhost:3000/admin/settings/general` and
  `http://localhost:3000/admin/content`.
- State: authenticated desktop admin, light theme, General Settings and the
  PageList Parent dropdown.
- Browser CSS viewport: 859 x 1273 px. The supplied references are narrower
  crops, so the comparison targets component hierarchy, spacing and control
  language rather than whole-page pixel parity.

## Required fidelity surfaces

- Fonts and typography: existing dashboard typography is unchanged and now
  applies inside admin widget ShadowRoots.
- Spacing and layout rhythm: Settings fields use one labelled field stack and
  action group. At the verified viewport PageList rows become two-column cards
  with actions inside the row instead of forcing page-level horizontal scroll.
- Colors and visual tokens: all new rules reuse `--studio-*` surfaces, borders,
  field radii, shadows, focus rings and motion values.
- Image quality and asset fidelity: the existing `/assets/icons/*.svg` Lucide
  set is reused. A rendered-image check found zero incomplete or zero-width
  images.
- Copy and content: existing settings labels, page titles, status values and
  actions are preserved.

## Interaction and accessibility verification

- The Page filters are semantic buttons with pressed state.
- Add, hierarchy, home and row actions are semantic buttons with accessible
  names.
- Parent selects rendered as the shared custom dropdown inside ShadowRoots;
  opening the first control displayed the tokenized listbox rather than the
  browser-native picker.
- Settings labels resolve to generated control ids and status messages use a
  polite live region.
- The prior console inspection showed only the known missing
  `registerWidgetUsage` listener warning and no icon/network errors.

## Comparison result

The references exposed missing UI-kit binding rather than a missing icon
package. Adding `app-scope` and per-ShadowRoot select observation restored the
existing Studio language. The post-fix comparison shows consistent rounded
fields, custom dropdowns, neutral floating icon actions and contained
responsive PageList rows. No actionable P0, P1 or P2 mismatch remains.

final unified-admin-controls result: passed
