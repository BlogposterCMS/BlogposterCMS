# Reusable Designer layouts

Design Studio is the only layout authoring surface. The former Layouts creator
is retired. Its stored widget URL delegates to the Designer library, and its
admin navigation page is marked deleted on startup. Existing template records
remain readable until their public-page assignments are migrated; removing the
creator does not delete page data.

Create shared headers, navigation and footers as a Designer document. Use the
existing container content-host action to select the destination for page
content. That destination persists as `isDynamicHost` in the LayoutTree and is
independent of the currently selected editor Section (`workarea`).

Attach a design through the existing page Content controls. Inherited page HTML
and attached content use the outer document's content host. Container `designRef`
references render complete nested Designer documents, including their own
container placement. References may be reused in siblings; circular references
and depth beyond 16 are stopped with `RUNTIME_DESIGN_REF_CYCLE_OR_DEPTH`.

Free placement, Auto and Grid remain placement modes of the same container tree.
They are not separate editors or separately persisted layout systems. Saving page
metadata no longer assigns an old grid template as a side effect.

Opening the Layout tab leaves the document's placements editable. Saved designs
autosave their full structure through Designer; the first save of a new document
is explicit. Autosave and manual Save are serialized to protect versioned writes.
