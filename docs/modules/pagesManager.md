# Pages Manager

## Page Settings: SEO and images

The existing page editor (`/admin/pages/edit/:id`, available from the settings
action in Pages) includes SEO title, description, Featured image and Link preview
image. Image controls use the existing media explorer and support public URLs,
preview and removal. These fields share the page draft, Save and Discard actions;
the existing `page.updateDraft` agent action can edit `seoTitle`, `seoDesc`,
`featuredImage` and `seoImage`.

Featured images are optional and stored in page `meta.featuredImage`, preserved
by the Content Engine mirror and usable in content lists. `seo_image` remains
the link-preview override. Preview images fall back to the featured image, then
the global SEO image. SEO titles use the existing translated `seoTitle` field.
These settings never change Designer layout assignments or insert a hero image.

The admin page list edits the selected page's title and address inline. Enter
saves through the existing page service; Escape restores the draft. Icon actions
sit at the right of the row. Parent/status settings remain in the page editor;
deleting a page or setting it as Home requires the shared confirmation dialog.
New pages and subpages use the shared dialog, with Cancel/Create in its footer.
The row menu contains deletion; copy/open links sit beside the address. Example
import is available from the page-list overflow menu.
Status stays beside the title on every row. Hover reveals page actions; clicking
a parent row toggles its children with reduced-motion-aware animation. Selection
does not focus an input; click the title/address directly to edit.

## Boundaries

Pages Manager is the current page projection facade while Content Engine becomes canonical.
Admin apps and widgets should use Runtime Manager's `pages` resource instead
of emitting page events directly. Direct page events require a scoped
`pagesManager` core payload and permission checks. Mirroring to Content Engine
is one-way through core events, not shared table access.

Responsible for CRUD operations on pages and for generating default pages when the CMS starts.

## Startup
- (public token required) Core module; ensures its database schema exists then seeds default pages if needed.
- First-install seeding ensures a public `coming-soon` page exists on every new
  installation. Empty installations set it as the start page, store its id in
  `MAINTENANCE_PAGE_ID` and enable `MAINTENANCE_MODE`.
- The Coming Soon seed saves a Design Studio design through `designer.saveDesign`
  when the core Designer adapter is available, then links the page through
  `meta.designId`. The seeded design is a dashboard-styled Design Studio tech
  preview built from first-party public widgets so a fresh install immediately
  demonstrates an editable public page. The static page HTML remains as a
  matching fallback so installs still succeed if Designer is unavailable.
- Public Design Studio previews render through the public widget loader's
  static canvas. It preserves saved percent bounds from the seed design and
  lets the linked HTML stay fallback-only, which keeps first-install previews
  from duplicating content.
- The seed is idempotent: pages marked with `meta.seedKey: "core.comingSoon"`
  and the retired raw HTML seed may be upgraded to the latest seed version, but a user-created
  `coming-soon` page without seed metadata is not overwritten.

## Purpose
- Provides events to create, retrieve and update pages.
- Can generate an XML sitemap and manage the start page.
- Acts as the page projection facade while Content Engine becomes the canonical
  content domain.
- Admin/editor callers should use `runtimeManager`'s `cmsAdminApiRequest`
  resource `pages` for page reads and writes. Direct page events are internal
  module contracts and are not exposed through `/api/meltdown`.

## Listened Events
- `createPage`
- `getAllPages`
- `getPagesByLane`
- `getPageById`
- `getPageBySlug`
- `getStartPage`
- `getChildPages`
- `getEnvelope` (public token required)
- `updatePage`
- `setAsDeleted`
- `searchPages`
- `setAsStart`
- Uses a MongoDB transaction when available so the old start flag is cleared
  atomically before assigning a new one.
- `generateXmlSitemap`

Permissions are checked for each sensitive operation to avoid unauthorized modifications.

## Slug Handling
- Slugs may include `/` to denote hierarchy. Each segment is normalized independently,
  so `content/My Page` becomes `content/my-page` and `Page Ünicode` becomes
  `page/unicode`. The top-level segments `admin`, `app` and `api` remain reserved.
- Uniqueness: a slug is only unique within its lane (`public` or `admin`).
- `createPage` now returns a deterministic duplicate error (`code: DUPLICATE_SLUG`)
  for page-management calls when the requested slug already exists in the same lane.
  Auto-suffixing (`-1`, `-2`, ...) is only applied when `autoSuffixSlug: true` is
  explicitly provided by the caller.

## Page Management workspace

- Content and Page Management render one fixed `pageList` workspace, using the
  existing runtime widget loader and Pages facade. Search, status counts,
  hierarchy and selected-page details are composed together. The UI does not
  expose widget insertion, removal, resizing or personal layout persistence on
  these routes. Navigation Studio follows the same composition rule.
- `meta.dashboardLayout: "fixed"`, `meta.widgets` and `meta.widgetSlots` are
  synchronized from PlainSpace's built-in page configuration on startup. Fixed
  tools ignore personal/global dashboard layouts and attached extras. Existing
  saved layouts remain stored; Home keeps its customizable dashboard behavior.
- Search and status filters retain ancestor rows, so nested matches keep their
  context. Normal branch expansion is retained when clearing the filter.
  In narrow workspaces details stack below the tree; selection moves focus to
  the details heading, and Back to pages returns to search without losing input.
- Title, full page address, parent and status save together through the existing
  `pages.update` action. Self/descendant parents and duplicate addresses are
  rejected. Changing the parent does not make the UI invent a new address;
  refresh from the page owner supplies authoritative paths after writes.
- Add page and Add subpage use the same details form and start as drafts. The
  shell's create shortcut enters that form. Subpage creation supplies an explicit
  parent and suggests a full address. Edit content opens the canonical editor.
- Switching pages or starting another page asks before discarding edited fields.
  Search/filter changes preserve the current form. Drafts are local to this
  mounted tool. CMS links/history ask before leaving; a native unload warning
  protects reload/full navigation. Disconnected tools no longer contribute guards.
- Failed writes retain input with `PAGE_MANAGER_*` messages. If a write succeeds
  but its refresh fails, `PAGE_MANAGER_SAVED_REFRESH_FAILED` locks further actions
  until Refresh pages succeeds; it must never resubmit an acknowledged create.
- Open, copy-link and home-page actions require a published page in the UI.
  Permission checks and persistence remain owned by the existing backend.

Regression coverage: `pageManagerWorkspace`, `pageListParentReassignment`,
`plainSpaceAdminPageSeeding`, `runtimeAdminGrid` and `contentHeaderActions`.

### Collections and the fixed page editor

Collections are a Pages view, not a separate content store. The existing
`deriveCollections` contract includes public parents with children and explicit
`meta.isCollection` pages. The filter retains nested child context. Add collection
creates a draft with that marker; ordinary parents qualify automatically. The
old Collections sidebar entry is retired; saved `collectionsList` instances
mount the same Page Manager with this filter selected.

Page Editor has a single page-sized `pageEditorWidget`. The existing
`pageContentWidget` is an internal section, with a shared in-memory draft and one
Pages update containing metadata, SEO and the selected attachment. Nothing is
written merely by selecting/detaching a design. Save failure retains the draft;
successful saves update the loaded record and clear its cache. Discard restores
the last saved state. Uploading HTML still stores a reusable media file immediately;
attaching that file to the page requires Save page. Stored standalone content
widgets retain their existing write behavior and are hidden from new insertion.

Attachment discovery is independently retryable and preserves successfully loaded
options. HTML content is fetched/sanitized on selection; HTTP errors are rejected.
Builder shortcuts use the installed app registry and the canonical Studio route.
Regression coverage: `pageEditorWorkspace`, `pageContentData`, `pageEditorData`
and `runtimeAdminNavigation`.

## Returned Data
- Page retrieval events (`getPageBySlug`, `getPageById`, `getPagesByLane`) include a `parentSlug` field with the slug of the parent page when available.
- Each page also exposes a `weight` integer (default `0`). Admin interfaces sort header and sidebar menus using this field.
- `getPagesByLane` accepts an optional `language` to limit translations to a single locale per page.
- **Update semantics:** `updatePage` only modifies the `weight` when the field is supplied. Omitting `weight` keeps the existing value.
- `getEnvelope` returns a `PageEnvelope` with ordered attachments describing design, HTML and widgets for the requested public page. Clients resolve attachments by importing `/modules/<source>/publicLoader.js` or `/mother/modules/<source>/publicLoader.js` and invoking its `registerLoaders` helper to wire the loaders into their orchestrator.
- Pages with `meta.designId` or `meta.design_layout` use that linked Design
  Studio layout in the public envelope. Their stored HTML is marked as a
  fallback-only attachment so the page remains readable if the design cannot
  load, but it does not duplicate a successfully rendered Design Studio layout.

A shared, framework-agnostic orchestrator and loader registry live under
`ui/runtime/envelope/`. PlainSpace, Vue, or React clients on the
same origin should import `/ui/runtime/envelope/orchestrator.js` and
`/ui/runtime/envelope/loaderRegistry.js` to process envelopes. The old
new code should use the `/ui/runtime/envelope/*` URLs directly.

## Content Engine Bridge
- Successful `createPage` and `updatePage` writes are mirrored to
  `contentEngine` as `page` entries.
- `setAsDeleted` also trashes the mirrored Content Engine entry by source id,
  so deleted page projections disappear from canonical content queries.
- Mirrored entries use `sourceModule: "pagesManager"` and `sourceId` equal to
  the source page id, so Content Engine can resolve future updates through
  `getContentEntryBySource`.
- The mirror is optional and non-blocking for page behavior. If Content
  Engine is not loaded or returns an error, the original page event still
  returns its normal result.
- Core importers may pass `skipContentMirror: true` when creating page
  projections for content that was already imported through Content Engine. This
  avoids duplicate canonical entries while still exposing parent/child
  collection structure to the current Pages UI.
# Initial public presentation

`publicPresentation.js` resolves the existing published envelope and optional
linked layout through the public runtime facade. It emits sanitized HTML for an
HTML page, or a canvas shell using the same geometry/CSS as the browser. It does
not load widget registries, execute authored JavaScript or create another page
store. The HTTP route owns CSP, escaped bootstrap injection and no-store headers.
The existing public loaders adopt the initial nodes and load later widget data.
See [public startup performance](../public-startup-performance.md).

## Admin editing routes and deleted records

The canonical page settings editor remains `/admin/pages/edit/:id`; Content's Page
Manager links to that existing route. The editor stages metadata, SEO and HTML content
for one explicit save. Deleted pages live in the Deleted filter and are excluded
from new parent/menu targets; an existing parent relationship is preserved until
explicitly changed.

Page details show the resolved attached design preview above the edit actions. The existing pagePresentationFromList resolver determines page, ancestor and site design ownership; composed pages prioritize their content design. Preview and title link directly to Design Studio. Missing assignments and missing thumbnails are explicit and do not create a new design mapping.

Edit design is the primary action; Site settings opens the existing page editor.
The shared popover menu links to #page-design, #page-html and #page-html-upload
in that editor. Attachments remain staged in its existing draft and saved through
Pages. Import HTML focuses the upload action rather than opening a file chooser
without a user gesture.

Page status uses the shared popover and existing guarded form save. Inline labels size to content so clicking empty row space does not focus a field.

The fixed page editor uses Details, Layout & content and SEO & previews tabs. All tabs retain a single draft and save footer. HTML source is expandable; attachment deep links open the content tab.

Layout help and HTML file selection are expandable. Switching editor tabs enhances newly visible selects. SEO text is grouped separately from image previews; existing media fields and draft actions remain authoritative.

### Article-only pages

The brush action reads the current page before opening an editor. Own designs
open Design Studio; existing HTML/attachments open the page HTML editor. Empty
pages offer **Create design** or **Article only** in the shared popover. A site or
ancestor design alone does not bypass that choice. Creating a design uses the
existing Designer save and Pages layout metadata contracts.

Article only opens the shared large dialog with a lazy-loaded Tiptap editing
kernel. It supports headings, rich text, links, lists, quotes, code, tables,
images and direct video files. Media uses the existing library picker; select a
media node and use Media description for alternative text/title. External iframe
embeds are not supported. Close protects unsaved work; Save article explicitly
persists content without publishing or changing SEO, parents or inherited layout.

Pages remains the only content owner: `page.html` plus
`meta.contentFormat = "article-v1"`. Block IDs persist as `data-block-id` HTML
attributes. Editor JSON is a transient view, not a second document store.
Existing arbitrary HTML is never silently converted to the restricted schema.
Save re-reads the page and refuses changed content; this is an optimistic UI
check, not an atomic database lock between simultaneous saves.

Agents use the existing Pages surface action `pages.openArticle` with a page ID,
then inspect the `article-<id>` workspace surface. It exposes the document and
stable blocks, and `article.replaceBlock`, `article.appendBlock`,
`article.deleteBlock`, `article.save`. Existing revision, draft-review and save
confirmation guards apply. Opening returns `opening: true`; wait for the article
surface before editing. All saves use the regular Pages facade and permissions.

New-page dialogs offer **Create design** and **Write article** directly. Both
save through the same Pages form before opening the chosen authoring surface;
collections retain their grouping-only creation action. A failed editor handoff
leaves the created page available instead of creating another page.

Page rows diagnose missing content destinations in their resolved design chain.
The red triangle says "Kein Inhaltsplatz definiert" and explains the remedy.
Checks use saved Designer trees and the existing presentation resolver; failed
reads are logged as `PAGE_CONTENT_SLOT_CHECK_FAILED`, not misreported as missing
slots. A standalone article is valid without a parent. Attached content pages
(`is_content`) also check their parent's destination.

In an HTML parent, place `<div data-dynamic-host="true"></div>` where attached
child content belongs. This is the existing Designer host marker, not a second
shortcode language or an arbitrary page lookup. Only children already selected
by the existing public attached-content contract are mounted there. Legacy HTML
without a marker keeps its previous fallback placement and receives a warning
when used as an attached-content parent. The HTML source editor shows the snippet.
