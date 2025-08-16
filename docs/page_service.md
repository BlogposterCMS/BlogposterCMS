# Page Service

The `pageService` module, located at `public/plainspace/widgets/admin/defaultwidgets/pageList/pageService.js`, provides a thin data layer for page operations.
It wraps `meltdownEmit` calls so UI code can remain focused on rendering.

## API

- `getAll()` – fetch all public pages.
- `create({ title, slug })` – create a new page.
- `updateTitle(page, title)` – update a page title.
- `updateSlug(page, slug)` – update a page slug.
- `updateStatus(page, status)` – change draft/published status.
- `setAsStart(id)` – mark a page as the site start page.
- `delete(id)` – remove a page.

All methods automatically include the current admin token and module
identifiers, ensuring consistent and secure access to the event bus.
