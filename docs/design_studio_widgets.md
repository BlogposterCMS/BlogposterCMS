# Design Studio Widget Inventory

This document defines the first useful widget set for the user-facing
**Design Studio**. The backend owner is `designerManager`; the public resource
identity remains `designer` where the app shell and runtime loader address the
same Design Studio surface.

## Boundary

Layout primitives are not widgets. Sections, splits, rows, columns, workareas,
global header/footer regions and static `designRef` containers belong to the
shared `DesignDocument.layoutTree` contract in `ui/shared/layout/`.

Widgets are content or behavior units that mount into a layout leaf. They must
use versioned metadata, follow the Design Contract, and keep data access behind
the existing AppLoader/runtime contracts.

The page surface itself is the default free-placement workarea. Authors can add
layout containers from the floating container toolbar; the parent container's
mode decides how automatic inserts behave: `stack` appends vertically, `row`
appends horizontally, and `free` keeps absolute CanvasGrid placement inside the
active workarea. Container settings such as gap, padding and background are
stored on the `LayoutTree`; widget placements store `workareaId` so runtime
mounting can target the correct container without turning containers into
widgets. Container authoring failures are isolated at the toolbar and shared
layout adapter boundaries, with searchable `DESIGNER_CONTAINER_*` diagnostics
instead of allowing a single bad action to break the Studio UI.
Containers and widget placements may also carry optional `styleSource`
metadata. The first source object owns reusable layout/design properties, while
followers copy those properties without copying content. Authors can unlink a
follower per object when a container or widget needs to diverge.

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
- `mediaBlock`: image/media presentation with alt text, captions, aspect ratio
  handling, safe links and clear empty states.
- `buttonLink`: primary, secondary and plain link actions with safe URL
  normalization.
- `navigationMenu`: public navigation menu rendering from
  `/api/public/navigation/:locationKey` or manually supplied links. Theme
  styles own the default menu appearance; Mega Menu item metadata can point to
  a Design Studio panel and falls back to child links.
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
  structure is curated in Navigation Studio; the public widget renders theme
  defaults and exposes optional Mega Menu metadata.
- Breadcrumb: shows the current page path for nested content.
- Collection Archive: renders public child pages from a selected collection
  parent. This is separate from the admin dashboard page-list widget.

### Navigation Studio Boundary

- Navigation Studio owns menu structure, item targets, visibility, status,
  warnings and Generate from pages.
- Themes own normal header, mobile, footer and dropdown styling.
- Design Studio is optional and scoped to Mega Menu panel content only. The
  header frame, positioning, animation and mobile behavior stay with the theme.

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
