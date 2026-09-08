# Design Studio Widget Inventory

`uiKitComponent` is the shared declarative UI-kit widget for buttons, form
controls, tabs, popovers and tooltips. Insert a named component from the existing
UI-kit panel or use `insert.element` with `componentId` and optional props.
Its preset definition travels in standard instance metadata; palette/font
references stay linked to the website libraries. See the
[component contract](website-branding.md#declarative-components). Containers and
business form submission retain their existing domain owners.

This document defines the first useful widget set for the user-facing
**Design Studio**. The backend owner is `designerManager`; the public resource
identity remains `designer` where the app shell and runtime loader address the
same Design Studio surface.

## Boundary

### Website logo

The Media catalog's `siteLogo` widget reads `SITE_LOGO_URL`,
`SITE_LOGO_DARK_URL` and `SITE_TITLE` from the existing public settings endpoint
on each render. Configure the images through Settings → Design → Branding,
using the existing media picker or a URL. The favicon remains separate.
The optional dark logo follows the document theme and the system preference
when no explicit theme is selected; a missing variant uses the available one.
Logos keep their proportions and transparency inside the widget bounds.
No logo URL is copied into the design, so subsequent page loads/renders use
the current settings without republishing the design. Existing open pages do
not poll for branding edits. Errors use `BP_WIDGET_LOGO_*` diagnostics.

### Shared rendering implementation

`ui/widgets/rendering/widgetModuleMount.ts` owns module load/render sequencing,
async completion and the existing `WIDGET_RUNTIME_*` diagnostics for Studio,
the widget catalog and the website. `widgetInlineCode.ts` owns saved-code
detection, instance metadata precedence (`meta` overrides `metadata`), HTML
sanitization and the existing nonce-aware script executor. Metadata-only
instances continue to render their registered module.

Studio delegates to `widgetRenderer.ts` and adds only scene context, editable
registration and text selection helpers. Runtime consumes the shared helpers
through `widgetRuntimeGateway.ts`; its adapter retains public/admin credentials,
event context and Shadow DOM/CSS isolation. Do not duplicate module execution
or saved-content parsing in these adapters. Layout geometry and editor chrome
remain outside this shared content renderer; this is not a claim of pixel-level
equivalence between editor and public page.

`tests/widgetRenderingParity.test.ts` exercises all three real entry points for
saved settings, async completion, sanitization, errors and public token isolation.
It also compares a real bundled button's generated content and component styles.

Local verification on 2026-09-05: all 28 parity regressions and the focused
rendering/architecture suites passed; Webpack production bundling passed.
The full build attempt was blocked by concurrent `agentSurface.ts` action-catalog
typing errors (`TS2345`, `TS18048`), and its existing source assertion still
expected the earlier catalog expression. No live visual or deployment acceptance
is claimed by these DOM-level tests.

Layout primitives are not widgets. Sections, splits, rows, columns, workareas,
global header/footer regions and static `designRef` containers belong to the
shared `DesignDocument.layoutTree` contract in `ui/shared/layout/`.

Widgets are content or behavior units that mount into a layout leaf. They must
use versioned metadata, follow the Design Contract, and keep data access behind
the existing AppLoader/runtime contracts.

The page root is always a vertical stack of canonical Sections. Each Section is
a stable workarea and can use `free`, `stack`, `row` or `grid` placement;
nested Containers use the same mode contract. A Container is a structural
layout item in its parent grid and, at the same time, a grid surface for its
direct children. Containers may therefore nest recursively without becoming
public widget modules or creating a second placement system. Section and
Container settings such as gap, padding, columns, alignment, minimum height and
background are stored on the `LayoutTree`; widget and Container placements
store the immediate surface `nodeId` as `workareaId` so Runtime can rebuild the
same hierarchy. Container authoring failures are isolated at the toolbar and
shared layout adapter boundaries, with searchable `DESIGNER_CONTAINER_*`
diagnostics instead of allowing a single bad action to break the Studio UI.
Containers and widget placements may also carry optional `styleSource`
metadata, but the relationship is never inferred from sibling order, creation
or movement. `Duplicate` clears relationship metadata and creates an
independent copy. `Linked copy` copies the current recursive structure and
independent content once, then links only corresponding layout/design
properties. Later widget-structure changes do not synchronize. Authors can
unlink a follower per object when a Container or widget needs to diverge.

Background inheritance is explicit: transparent Section -> page background ->
global website Body background. The global color is stored by SettingsManager
under `DESIGN_STUDIO_GLOBAL_BODY_BACKGROUND`; the page and Section values stay
inside the saved LayoutTree.

## Foundation Set

### Insert Palette

The Design Studio insert sidebar shows grouped presets instead of every
technical widget as a first-level choice. The visible groups are Text, Media,
Shape, Button, Navigation and Content. Selecting a group opens its preset panel;
dragging a group still keeps the fast insert path.

- Text presets resolve to the stable `textBox` widget id and store rich
  text settings in widget metadata.
- Media presets use `mediaBlock` for single images and `gallery` for grid,
  masonry and carousel galleries.
- Button presets use `buttonLink` with primary, secondary and plain-link
  variants.
- Navigation presets use `navigationMenu` and `breadcrumb`.
- Content presets use `collectionArchive` for manually selected page
  collections.
- Shape, Divider and Spacer remain lightweight `htmlBlock` fallbacks until a
  dedicated public shape widget is introduced.

`htmlBlock` remains registered for importer fallbacks, but it
is marked as advanced and hidden from normal catalogs.

### Implemented Bundled Widgets

- `textBox`: Rich Text baseline for headings, paragraphs and sanitized saved
  HTML while keeping the saved-design widget id stable.
  Heading, Subheading, Paragraph, Quote and Caption are insert presets for this
  same widget, not separate widget types. After insertion, the text toolbar can
  switch the active block between H1-H6, Paragraph, Text block, Inline text,
  Quote and Code block while preserving its content, non-typographic
  attributes and widget instance id. A role switch resets block-level font
  overrides so the newly selected typography preset becomes visible
  immediately; formatting inside nested spans and links remains intact.
  Double-clicking a selected text widget activates this registered Rich Text
  root, so typing and toolbar changes cannot target the surrounding canvas
  item.
- `mediaBlock`: image/media presentation with alt text, captions, aspect ratio
  handling, safe links and clear empty states.
- `buttonLink`: primary, secondary and plain link actions with safe URL
  normalization.
- `navigationMenu`: public navigation menu rendering from
  `/api/public/navigation/:locationKey` or manually supplied links. Central
  widget settings own the default menu appearance; Mega Menu item metadata can
  point to a Design Studio panel and falls back to child links.
- `breadcrumb`: current-path or manually supplied breadcrumb trail.
- `gallery`: ordered media gallery with grid, masonry and carousel modes plus
  per-image fit/focus metadata.
- `collectionArchive`: renders public child pages from a manually selected
  collection parent as left-to-right cards with image, title, SEO description
  and a link action. It uses the existing `pagesManager.getChildPages` public
  event contract and remains separate from the admin dashboard page-list widget.

### P0 Authoring Basics

- Rich Text: headings, paragraphs, inline formatting and reusable typography
  presets.
- Image / Media: image, video poster and media-library selection.
- Button / Link: primary, secondary and plain link actions.
- Shape / Divider: visual separators, backgrounds and simple accents.
- Spacer: intentional whitespace without abusing empty text or media widgets.

### P0 Navigation

- Menu: renders a selected page tree or manually curated links. The menu
  structure is curated in Navigation Studio; the public widget renders central
  Builder defaults and exposes optional Mega Menu metadata.
- Breadcrumb: shows the current page path for nested content.
- Collection Archive: renders public child pages from a selected collection
  parent. This is separate from the admin dashboard page-list widget.

### Navigation Studio Boundary

- Navigation Studio owns menu structure, item targets, visibility, status,
  warnings and Generate from pages.
- Central widgets and Builder settings own normal header, mobile, footer and
  dropdown styling.
- Design Studio is optional and scoped to Mega Menu panel content only. The
  header frame, positioning, animation and mobile behavior stay with the
  central navigation widgets and settings.

### P1 Forms And Conversion

- Form: contact/custom fields with validation and submit-state rendering.
- Newsletter Signup: email capture wired through a future integration adapter.
- Search: site search input and result handoff.

### P1 Content Blocks

- Card / Teaser: reusable card for pages, posts or manual content.
- Collection / Repeater: future generalized record repeaters should reuse the
  `collectionArchive` source-selection and card-style-source contract where it
  fits instead of inventing a parallel listing system.
- Gallery: ordered media set with grid, masonry or carousel presentation,
  configurable rows/columns, height strategy, per-image fit/focus metadata and
  slider animation settings.
- Embed: trusted iframe/embed payloads with explicit allowlist handling.

### P2 Power Authoring

- Map: address or coordinate based location block.
- Code / HTML: trusted-author only block with strict sanitization and visible
  risk labeling.
- Custom Component: registered first-party component mounted through a manifest,
  not arbitrary inline runtime code.

## Rules

- Do not create layout widgets for rows, columns, sections or global regions.
- Prefer native presets for simple authoring elements before adding separate
  modules.
- Every widget needs a stable manifest id, versioned settings, a size contract
  and clear empty/error states.
- Dynamic widgets must fail closed when data cannot be fetched and should expose
  searchable error codes at transport and render boundaries.
- Public runtime output must hydrate through the shell-first runtime path, not
  direct Designer-only APIs.
