# Design Studio Widget Inventory

This document defines the first useful widget set for the user-facing
**Design Studio**. Internal code and backend events may still use the
`designer` name for compatibility.

## Boundary

Layout primitives are not widgets. Sections, splits, rows, columns, workareas,
global header/footer regions and static `designRef` containers belong to the
shared `DesignDocument.layoutTree` contract in `ui/shared/layout/`.

Widgets are content or behavior units that mount into a layout leaf. They must
use versioned metadata, follow the Design Contract, and keep data access behind
the existing AppLoader/runtime contracts.

## Foundation Set

### P0 Authoring Basics

- Rich Text: headings, paragraphs, inline formatting and reusable typography
  presets.
- Image / Media: image, video poster and media-library selection.
- Button / Link: primary, secondary and plain link actions.
- Shape / Divider: visual separators, backgrounds and simple accents.
- Spacer: intentional whitespace without abusing empty text or media widgets.

### P0 Navigation

- Menu: renders a selected page tree or manually curated links.
- Breadcrumb: shows the current page path for nested content.
- Page List: renders public child pages or selected page collections. This is
  separate from the admin dashboard page-list widget.

### P1 Forms And Conversion

- Form: contact/custom fields with validation and submit-state rendering.
- Newsletter Signup: email capture wired through a future integration adapter.
- Search: site search input and result handoff.

### P1 Content Blocks

- Card / Teaser: reusable card for pages, posts or manual content.
- Collection / Repeater: renders multiple records from a selected source.
- Gallery: ordered media set with grid or carousel presentation.
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
