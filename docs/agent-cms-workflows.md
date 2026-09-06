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

| Workspace | Shared actions and state |
| --- | --- |
| Pages | Search, select, start a page/subpage draft, edit details, save, refresh; hierarchy, status, parent and draft fields |
| Page editor | Edit details; attach/detach an existing design or HTML source; save the same page form |
| Navigation | Select menu/item, edit/save link details, add page links and move branches through existing validation |
| Media | Browse/search/select, reload, create folder, rename/delete; picker acceptance uses its actual type filter and mutation setting |
| Libraries | Widget search/selection/view; saved design inventory and editor destinations |
| Settings | General title/description, favicon, SEO defaults, registration and maintenance; only explicit non-secret fields |
| CMS shell | Open known workspaces or a page editor; hand off to the separate Designer document after acknowledging navigation |
| Designer | Existing scene, element, text, geometry, styles and preset commands; content destination, reusable design reference, direct save/publish |

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
