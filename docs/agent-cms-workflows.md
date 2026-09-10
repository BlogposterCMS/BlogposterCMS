# Shared human and agent workflows

CMS workspaces publish their current owner state through AgentManager. Use
Agent Access for authentication and `/admin/api/agent/surfaces` for discovery.
See [Agent Access](modules/agentAccess.md). HTTP writes require the installation's
normal CSRF token and matching cookie in addition to the agent bearer token.
The browser must be open for commands to execute; an API delivery receipt is
not proof of a completed command.

## Read, edit, review, save

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
