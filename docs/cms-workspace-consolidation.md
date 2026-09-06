# CMS workspace consolidation

The CMS uses fixed task workspaces while retaining the existing widget/module
implementation. Home remains customizable. Local implementation and verification
are separate from a YiTaiCOS production release.

## Human and agent collaboration

Blogposter is an agent-first CMS with a clear human interface. Each workflow
should let a person or an agent continue work on the same canonical entity and
draft, through the same owning module, permissions and validation. Fixed
workspaces make that shared task visible; they are not the entire agent contract.

- Expose stable entity identifiers, current selection, draft/save/publish state,
  available actions and actionable errors through the existing
  AgentManager/AppLoader surface contract. Screen scraping must not be the only
  way to discover or control a supported CMS workflow.
- Route human controls and agent commands through the same operation handlers.
  Agents must not silently overwrite a person's unsaved draft or bypass pending
  writes, permissions or publish confirmation required by the operation.
- Make handoffs explicit: what changed, what is saved, what still needs review,
  and whether the state an agent read is still current. Test a human-to-agent
  handoff and the reverse, including failed writes and stale state, before
  describing a workflow as complete for both.

The implemented workspace adapters and their remaining gaps are listed in
[CMS agent workflows](agent-cms-workflows.md). Media browsing and supported file
operations now use that contract; uploads and other missing adapters still
belong to their existing owners. Do not add an independent agent file API or
draft store.

## Shared appearance

The default account accent and Default preset primary color are neutral black
(`#171717`). Dark mode uses a light neutral accent with dark labels for contrast;
both explicit and system dark mode use the same tokens. Existing installations
keep their stored account and palette values until those values are updated
through the normal administration APIs.

Page rows span the list width. Selected rows use a shared neutral background,
without a leading accent stripe. Child disclosure controls sit at the trailing
edge; nested indentation continues to communicate the hierarchy.

| Surface | Result | Evidence / remaining release check |
| --- | --- | --- |
| Pages / Content | One fixed hierarchy and details workspace; deleted records have their own filter | Three-level local hierarchy and phone selection checked; focused save, reparenting, recovery and navigation tests |
| Navigation | One menu structure and details workspace; saved structure operations and explicit link save | Local menu rendering and narrow selection checked; ordering, target updates, draft protection and failures tested |
| Collections | Page Manager filter and draft collection creation; duplicate entry retired | Existing parents/children and metadata retained; legacy widget delegates to Pages |
| Page editor | Metadata, SEO and content share one fixed editor and explicit save | Real local draft create/save/reload verified, including design attachment; phone dark and desktop light checked |
| Media | Fixed file Explorer with folder navigation, selection, sorting, previews and explicit picker confirmation | Real local create/rename/delete checked and test folder removed; stale reads, selection, history, sorting and picker safety covered by tests |
| Widgets | Fixed searchable public library, global saved-layout usage and local templates | Bounded complete scan above 20 pages, failed reads, empty results and selection tested |
| Design Studio library | Fixed canonical design library; legacy Layouts retired | Retry distinguishes failed reads from empty data; existing Designer remains owner |
| Home | Customizable overview, quick links and recent content | Canonical editor URLs, meaningful empty/error states; duplicate creation flow removed |
| Settings | Existing task panels kept; common save/leave/loading/retry behavior | Independent tab drafts and duplicate-write protection tested; Settings root opens General; shared media picker verified; embedded administrative panels retained |
| Import / Export | Inactive core placeholder retired | No importer/exporter module or data removed; actual operations remain module-owned |
| Legacy/demo widgets | Hidden from new catalog insertion | Saved instances remain supported; no dashboard data erased |
| Public widgets | Text, media, links, navigation, breadcrumbs, gallery and collection archive retained | Sanitization and core render tests; gallery clipping/focus corrected; invalid collection links no longer navigate to the current page |

## Boundaries

- Pages, Navigation Manager, Media Manager and Designer keep their existing data,
  permission and transport ownership. Fixed compositions do not create a second UI
  framework or store.
- Retirement tombstones only redundant core admin entries through Pages Manager.
  Public pages, designs, media, saved layouts and widget instances remain intact.
- Removed the unused `widgets.registerUsage` startup request and facade mapping:
  Widget Manager has no corresponding operation, and renderers ignored its result.
  Widget API metadata stays descriptive. Every actual request still passes the
  existing runtime facade permission checks. Deploy browser and backend together.
- Local tests and rendered checks are not production acceptance. The release gate
  remains YiTaiCOS nested public routes, draft visibility, publish/preview parity,
  reload persistence and shared media/widget behavior on the deployed integration.
