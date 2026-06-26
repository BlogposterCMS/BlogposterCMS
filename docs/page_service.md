# Page Service

The `pageService` module, located at `ui/widgets/plainspace/admin/defaultwidgets/pageList/pageService.js`, provides a thin data layer for page operations.
It wraps `meltdownEmit` calls so UI code can remain focused on rendering. The
legacy `/plainspace/widgets/admin/defaultwidgets/pageList/pageService.js` URL is
kept as a compatibility shim only.

## API

- `getAll()` – fetch all public pages.
- `getPagesByLane(lane)` – fetch pages for a specific lane (`public` fallback for invalid lane values).
- `create({ title, slug, status, meta })` – create a new page with optional `status` and `meta` fields.
- `updateTitle(page, title)` – update a page title.
- `updateSlug(page, slug)` – update a page slug.
- `updateStatus(page, status)` – change draft/published status.
- `updateParent(page, parent_id)` – update page hierarchy by persisting `parent_id` through `updatePage`.
- `setAsStart(id)` – mark a page as the site start page.
- `delete(id)` – remove a page.

The module also exports `sanitizeSlug(raw)` for consistent slug normalization.
It lowercases input, accepts strings or numbers, and returns an empty string for
`null`/`undefined` values so UI components can safely generate links without
runtime errors.

All methods automatically include the current admin token and module
identifiers, ensuring consistent and secure access to the event bus.
