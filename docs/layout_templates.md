# Layout Templates

Version 0.5.0 introduced a dedicated **Layouts** page in the admin dashboard for managing layout templates.

Layout templates let you reuse grid layouts across multiple pages. Each template stores widget positions and a preview image.
They are different from Design Studio layout trees:

- **Layout templates** are PlainSpace page/grid templates made of widget positions.
- **Design Studio layouts** are `DesignDocument` payloads made of a structural
  `LayoutTree`, widget placements, scenes and design metadata.

Do not model sections, rows or columns as normal widgets. Those belong to the
Design Studio layout tree and the shared `ui/shared/layout/` contract.

## Creating Templates

1. Open **Layouts** in the admin navigation for grid templates, or **Design Studio** for structural designs.
2. Click **Create** and arrange widgets on the empty CanvasGrid layout.
3. Save the template. A preview image is automatically generated using the shared `capturePreview` helper.

Templates can be edited later by selecting them from the list. Updating a template does not affect existing pages until you apply the template again.

## Applying Templates

When creating or editing a page, choose a layout template from the sidebar. The page inherits the widget layout defined in the template. Individual widgets may still be customized afterwards.

Layout templates speed up page creation and ensure consistent design throughout your site.
