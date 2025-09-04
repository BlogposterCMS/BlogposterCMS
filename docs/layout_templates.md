# Layout Templates

Version 0.5.0 introduced a dedicated **Layouts** page in the admin dashboard for managing layout templates.

Layout templates let you reuse grid layouts across multiple pages. Each template stores widget positions and a preview image.

## Creating Templates

1. Open **Layouts** in the admin navigation.
2. Click **Create** and arrange widgets on the empty CanvasGrid layout.
3. Save the template. A preview image is automatically generated using the shared `capturePreview` helper.

Templates can be edited later by selecting them from the list. Updating a template does not affect existing pages until you apply the template again.

## Applying Templates

When creating or editing a page, choose a layout template from the sidebar. The page inherits the widget layout defined in the template. Individual widgets may still be customized afterwards.

Layout templates speed up page creation and ensure consistent design throughout your site.
