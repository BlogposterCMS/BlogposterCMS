# Optional documentation example

Open **Content → Pages → Import example** and choose a root address, such as
`docs-example`. The importer creates three English draft pages: **Introduction**,
**Layouts & pages**, and **Working with agents**. The latter two are children of
Introduction. It also creates a shared draft design and a separate chapter menu.
Nothing is seeded automatically during installation.

The design contains a header, native chapter menu and breadcrumb, a page-content
container, and a footer. Edit the frame in Design Studio and the three articles
in the page editor. In the selected Menu's **Content** inspector, **Edit menu
links** opens Navigation Studio. The article's table of contents and previous/next
links are authored examples; they are not automatically generated widgets.

Review and publish the shared design before publishing its pages. Import never
changes the home page or website main design. An occupied root address, descendant
address or example menu is rejected; choose another root to make another copy.
The example is independent so it can be explored without replacing a site's
existing design. It demonstrates the same content-area mechanism used by a main
design and a composed page design.

## Agents and recovery

On the existing Pages surface, use `pages.previewExample` with `rootSlug` for a
read-only preflight. `pages.importExample` accepts the same root, the current
`expectedRevision` and `confirm: true`. Existing draft/busy guards apply. Read
`lastExampleImport` for the created page IDs, design ID and menu key.
The underlying facade remains `importers.run` with `importerName: exampleSite`
and `options: {exampleId: docs, rootSlug: docs-example, dryRun: true}`. Set
`dryRun: false` to apply. Domain permissions and validation still apply.

Imports span the existing Designer, Navigation and Pages transactions. On
`EXAMPLE_IMPORT_PARTIAL`, review the reported created IDs before trying another
import. Successful writes are retained; the importer does not delete them or
silently retry. `EXAMPLE_IMPORT_ADDRESS_IN_USE` means no import writes started.

## Repository template and first paint

`examples/docs-site/` is the bundled source: `design.json` describes the shared
Designer document, three HTML files contain the articles, and `presentation.css`
is the common scoped styling. `index.js` resolves only the bounded root slug;
there is no arbitrary JSON/file upload or executable package import here.

Articles carry the same stylesheet in their saved page CSS, so the first server
response already has the typography, article columns and light/dark colors.
`initial-presentation.css` positions the readable article until the saved content
host exists. Those temporary selectors stop matching after adoption. The header
also supplies the scoped CSS in Studio, where there is no public page response.
Keep this common source when adjusting the example, rather than introducing a
JavaScript-only dependency for article presentation. Existing imported copies
remain ordinary editable CMS records and are not updated when this template changes.
