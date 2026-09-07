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

Assign page designs through the existing page Content controls. Page HTML and
attached content use the innermost page design's explicit content host. Container `designRef`
references render complete nested Designer documents, including their own
container placement. References may be reused in siblings; circular references
and depth beyond 16 are stopped with `RUNTIME_DESIGN_REF_CYCLE_OR_DEPTH`.

## Blog and documentation workflow

1. Create a shared design with header, content and footer containers. Use Auto
   (vertical) or Grid for containers around the article so content can grow.
2. Mark exactly one container as **Page content area**. Save/publish the design.
3. In the centered Pages header, choose **Choose main design** and save the
   published design. This is the website default, independent of URL hierarchy.
4. In each page editor choose one of these modes:
   - **Main design · Content page** (default): main design → page body.
   - **Own design inside main design**: main design → page design → page body.
   - **Own design only**: page design → page body, without the website frame.
5. Mark one content area in each design that receives content. The main design's
   area loads the selected page design or body. The page design's area loads its
   own body. Linked header/footer designs keep independent slots. For example,
   a documentation page design can provide a horizontal sidebar/article layout
   inside the website's vertical header/content/footer layout.

Use Free placement for freely positioned visuals, Auto (vertical/horizontal)
or Grid for flowing containers, and nest them as needed. Long article content
needs Auto/Grid ancestors so the footer follows its actual height. Mark a
Section in the inspector, or a nested Container with **Content area** in its
toolbar. A content host is a saved role, not the current editing selection.

The Pages header shows the actual main design and the number of pages using it.
No design is selected automatically from the library. Changing the main design
updates default/composed pages without copying it into each record; independent
page assignments retain their selected mode. Without a main design, content
pages show their body and composed pages show their own design.
Switching layouts or attaching HTML preserves the separately authored body.

Settings owns `SITE_MAIN_DESIGN_ID`; assignment uses existing `settings.set`
permissions and validates a published design with exactly one content area.
Pages owns `meta.pageDesignMode` (`main`, `composed`, `design`) and `meta.designId`.
Existing explicit `inheritParentDesign: true` and `none`/legacy aliases remain
readable; newly unassigned pages use `main`, not their URL parent's design.
Legacy ancestry traversal is
bounded to 16 ancestors and detects cycles (`PAGE_LAYOUT_CYCLE`,
`PAGE_LAYOUT_DEPTH`). Public inheritance stops at unpublished/deleted ancestors
or a different lane; the editor identifies a draft parent before publication.

The public envelope loads design, structural widgets and page HTML in that
order. `designer.getLayout` carries the normalized LayoutTree, and the shared
Designer/runtime renderer adopts the server-rendered body into the innermost
page-composition content host. A fixed linked component's host cannot capture it.
The same design used as main and page design renders once. Missing/circular
page composition produces `RUNTIME_PAGE_COMPOSITION_FAILED` and keeps the
page body available. The public facade still filters draft designs.
Designs without a content host retain their existing full-page presentation.
Free-positioned ancestors cannot provide natural article flow; use Auto/Grid
there (`RUNTIME_PAGE_CONTENT_FREE_ANCESTOR`).

For reusable colors, typography and starting blocks, use the Designer's
[UI kit panel](site-presets.md). Reusable authored header/footer components stay
in saved designs linked through container `designRef`; kits do not replace that
composition contract or introduce a Theme runtime.

Free placement, Auto and Grid remain placement modes of the same container tree.
They are not separate editors or separately persisted layout systems. Saving page
metadata no longer assigns an old grid template as a side effect.

Opening the Layout tab leaves the document's placements editable. Saved designs
autosave their full structure through Designer; the first save of a new document
is explicit. Autosave and manual Save are serialized to protect versioned writes.
