# Shared human and agent workflows

CMS workspaces publish their current owner state through AgentManager. Use
Agent Access for authentication and `/admin/api/agent/surfaces` for discovery.
See [Agent Access](modules/agentAccess.md). HTTP writes require the installation's
normal CSRF token and matching cookie in addition to the agent bearer token.
The browser must be open for commands to execute; an API delivery receipt is
not proof of a completed command.

## Read, edit, review, save

### Targeted page presentation CSS

The existing Runtime Manager `pages.update` action accepts `params.pageId` and
`params.presentationCss = { language, css, expectedRevision }`, requiring
`pages.update` permission. Read the exact target translation first. Its revision
is the lowercase SHA-256 of UTF-8 `JSON.stringify([String(pageId), language, css || ''])`.
Do not combine this patch with title, translations, meta, SEO or publication fields.
Only the existing translation's CSS column is compared and changed atomically;
missing translations and stale CSS return `PAGE_CSS_PATCH_TRANSLATION_NOT_FOUND`
and `PAGE_CSS_PATCH_VERSION_CONFLICT`. Read again before resolving a conflict.
There is no multi-page transaction. ContentEngine follows the existing Pages mirror;
`PAGE_CSS_PATCH_MIRROR_*` means Pages CSS was saved but canonical reconciliation
failed, so read/reconcile before retrying rather than treating the request as unwritten.

### Existing designs and Pages navigation

Open the intended existing design with `cms.openDesign`, rediscover the Designer
surface, then use its edit actions and `design.save`. The native owner retains the
loaded design id/version and rejects `DESIGNER_VERSION_CONFLICT`; reload and review
instead of substituting another design's version. JSON Import creates a draft copy,
not a replacement for an existing id. The existing authenticated `designer.get` /
`designer.save` facade supports native design/layout/complete-widget payloads with
the target's current `design.id` and `design.version`; saving requires `builder.publish`.
GET widget storage rows must be normalized through the existing Designer loader,
not blindly submitted as save widgets. No separate per-session CLI is shipped.

Menu settings now accept `source: 'pages'` and `parentId`, plus `maxDepth` (1–4).
Designer offers Source/Parent page controls; `navigation.configure` uses the same
settings. Pages supplies published public descendants only, ordered by weight/id;
hidden branches and missing secondary translations are omitted. Links retain `lang`
and the existing renderer marks the current page. Page Editor's optional Navigation
title is stored in `meta.navigationTitles[locale]` (120 characters), falling back to
the translated page title. Managed menus retain `navigation.manage`; choosing a
source never bypasses permissions. Public results are bounded to 2048 source rows
and 256 projected descendants.

Source failures expose their existing request error and an explicit retry without
discarding the design draft. The signed origin token is checked at app bootstrap;
subsequent requests use the parent AppLoader bridge's current authenticated context.
Its five-minute bootstrap validity is not an ongoing save-session expiry. Do not
extend or bypass auth protections to mask a source/save failure.

Designer publication rejects failed page lookups with
`DESIGNER_PUBLISH_PAGE_LOOKUP_FAILED`; it must not reinterpret a failed lookup as
an absent page. To release an imported design without touching a page, use the
existing authenticated `designer.save` native payload with its own current
id/version and `design.isDraft: false`, preserving its complete current widgets,
layout and other design metadata. This is distinct from Publish to page, which
attaches a design to a page and changes that page's publication state.

1. Discover a fresh, active surface on the intended route and read its action
   catalog. CMS ids are `cms.<workspace>.<instance>` under `plainspace`; Design
   Studio uses the established `designer/studio.designer` surface.
2. Inspect state, selection, errors and the shared draft. Use `state.stateRevision`
   as `params.expectedRevision`. Designer stores this under `state.collaboration`.
   This revision differs from AgentManager's periodically incremented snapshot
   revision and changes when the actual document, selection or owner state changes.
3. An existing dirty draft requires `acceptDraft: true` on a compatible action.
   Actions that would discard a draft remain blocked. Save, publication and other
   consequential actions declare `confirm: true` in their catalog. This records
   the agent's explicit intent; it is not a substitute for the caller obtaining
   any required human authorization.
4. Await the final acknowledgment and read the new state. On `CMS_AGENT_STATE_CHANGED`
   inspect and re-plan; do not retry blindly. Failed saves retain the draft.
   Pending operations temporarily prevent conflicting UI edits and navigation.
   The existing notification component tells people what the agent is doing.

## Implemented adapters

Pages also offers `pages.previewExample` and `pages.importExample` for the
[optional English documentation example](docs-example.md). Both accept a root
address; import uses the usual revision, draft and confirmation guards and
reports the created records in `lastExampleImport`.

| Workspace | Shared actions and state |
| --- | --- |
| Pages | Search, select, start a page/subpage draft, edit details, save, refresh; hierarchy, status, parent and draft fields |
| Page editor | Edit details; stage layout inheritance/override and page HTML independently; attach/detach HTML; save the same page form |
| Navigation | Select menu/item, edit/save link details, add page links and move branches through existing validation |
| Media | Browse/search/select, reload, create folder, rename/delete; picker acceptance uses its actual type filter and mutation setting |
| Libraries | Widget search/selection/view; saved design inventory and editor destinations |
| Settings | General title/description, favicon, SEO defaults, registration and maintenance; only explicit non-secret fields |
| CMS shell | Open known workspaces or a page editor; hand off to the separate Designer document after acknowledging navigation |
| Designer | Existing scene, element, text, geometry, styles and preset commands; content destination, reusable design reference, UI-kit JSON import/export, direct save/publish |

Use `pages.setMainDesign` with `designId` (empty clears the default), the current
revision and `confirm: true` to save the website frame through Settings. Its
Pages snapshot exposes the assignment, loading/error state and available designs.
For page composition, use `page.setLayout` with `mode: main`, `composed` or
`design` (the latter two require `designId`); legacy `inherit`/`none` remain
readable. `page.setContent` stages sanitized `html`. These page-editing
actions do not save: use the existing `page.save` command after reviewing the
shared draft. The content snapshot reports the resolved layout/source and a
pending selection or lookup error. Pages exposes the selected presentation and
the website main design in its header. Follow
[the layout workflow](layout_templates.md) for publication/composition rules.

`cms.openDesign` acknowledges a **scheduled** document handoff. Re-discover
`studio.designer` and wait for its command-port readiness before editing. The
Designer keeps its AppLoader contract and opts out of the generic DOM surface
with `<meta name="agent-surface" content="manual">`.

Snapshots are bounded by AgentManager's existing size/depth limits. For large
page/file lists narrow the search, then inspect the matching entries. Full
Designer structure remains in the established flattened feedback tree; an
embedded serialized draft may be truncated. This is not a headless publishing
job queue or an atomic multi-module transaction.

## Ownership and remaining adapters

`workspaceAgent.ts` supplies guards and host registration, not a second draft
store. Ordinary admin hosts report/poll/ack through `cmsAdminApiRequest` resource
`agentSurface`; only `plainspace/cms.*` is accepted. AgentManager retains its
existing permissions. Actual mutations still call their existing domain services.

Secret/API-key fields and embedded access/module configuration are deliberately
absent from generic field patching. Media uploads, menu creation/deletion, and
library authoring continue through their existing owner interfaces; they have no
new workspace command here. Add future adapters at those owners with tests,
not a generic DOM writer or an alternative agent API.

The Design library's **Import design JSON** accepts a portable
`{ design, layout, widgets }` document (up to 1 MiB, 500 widget instances).
Its review creates a new draft through `designer.save`; source IDs, owner,
global/default status and publication flags are not imported. It cannot install
widgets, import executable widget code, bind a page or publish automatically.
Install required widget packages first, open the copied draft in Studio, then
use the existing editing/save/publish and page-layout workflow. Existing designs
and pages remain independent. The import has no new AgentManager command yet;
its domain helper remains separate from the file picker, and Studio's existing
agent adapter takes over after import.
## Article labels and shared guides

The page brush opens content, while the gear opens Page Settings. Article content
uses the shared document modal; imported HTML uses its source modal to preserve
markup and file metadata. Both expose an inline page title and a Design Studio
icon. `article.setTitle`, block actions and `article.save` share one document
draft. `content.edit`/`content.save` serve existing HTML. Saving a selected locale
does not overwrite the primary title or another language. Explicit SEO titles
remain unchanged; the public SEO resolver derives its fallback from the page
title and optional site title template. Design names are internal library labels.

`article.openDesign` and `content.openDesign` save pending content, then open a
design with a real page-content host. From a page-bound Studio context,
`page.openDocument` warns that the page will stop using its design. It requires
confirmation and a saved, idle design. Only the page association changes; widgets
remain in the saved design library and are not flattened into article text.
The document modal's Studio icon can reattach that same design. Agent commands
use the same actions and require fresh revisions, draft review and `confirm=true`
where the catalog specifies it. Layout assignment is shared between translations.

See [Link target feedback](link-target-feedback.md) for immediate destination
warnings and identical agent snapshots. Public availability and a completed
AgentManager command acknowledgment are separate from deployment verification.

Read the current page snapshot, use `page.updateDraft` with the `tags` field,
then the existing save action. Native API clients can set `meta.tags` through
`pages.update`; preserve other metadata from the current record. The Page Manager
surface exposes `pages.filterTag` and includes page tags in its snapshot.

Reuse one article and URL across help, documentation and learning-path views.
The existing Designer public search data source accepts `tag` (comma-separated
AND filtering), `q`, `lang` and `limit`. Read `items[].tags` to display
labels. Tags are public editorial classification, not authorization. Save/reload
and check both public search and the translated article; a tag input alone is
not evidence of successful indexing. See [Search Manager](modules/searchManager.md).
