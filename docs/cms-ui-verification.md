# CMS UI verification

## Existing ownership

Admin chrome follows the Studio theme tokens. Public website body colors remain
owned by `DESIGN_STUDIO_GLOBAL_BODY_BACKGROUND`; they must not color the admin
shell. Widget ShadowRoots inherit tokens, including `--studio-icon-filter`,
because a document `:root` selector cannot target their descendants.

## Regression checks

1. Open Content / Page Management in light and dark modes. One workspace
   contains search, counts, hierarchy and selected-page details. Sidebar buttons
   sit on the shell canvas; the outer surface keeps the login card's subtle
   border and shadow. Widget insertion, edit, resize and remove controls are
   absent. Home still exposes the normal dashboard controls after navigation.
2. Expand three hierarchy levels, switch filters and return to All. Search for
   a grandchild: its ancestors remain visible. Change several page fields,
   filter again and switch selection: input survives filtering, while selection
   requires confirmation before discarding it. Save once; simulate failed writes
   and a successful create followed by a failed refresh. Recovery must never
   issue another create. At narrow widths the inspector stacks below the tree.
3. Check maintenance enabled and disabled. A disabled notice stays hidden;
   an enabled notice uses the standard neutral dashboard surface and an explicit
   disable action. Check focus and wrapping on narrow viewports.
4. Open the dashboard widget catalog. Search with whitespace, search without
   matches, insert using Enter/Space, and close with Escape. Closing removes the
   panel from keyboard navigation and returns focus to its toggle.
5. Check a public gallery with an offset parent, several slides, no loop, and
   fade animation. The track stays clipped, controls remain outside the clip,
   end buttons disable, and hidden fade slides cannot receive focus.
6. Open Design Studio's library with successful, empty and failed responses.
   Failures show `DESIGNER_LAYOUTS_LOAD_FAILED` with Retry, never an empty library.

7. In Navigation Studio, select a menu, add a root link and an explicit child,
   reorder with arrows and drag a nested child. Check draft retention, failed
   writes, page-target URLs, custom-link conversion and the collapsed saved-link
   preview. Menu selection and details stack cleanly in narrow workspaces.

8. In fixed CMS workspaces, resize the browser and check the bottom edge: the
   card meets the bottom navigation without an empty strip or document scroll.
   Headers keep their natural height; long content scrolls inside the workspace.
   The sidebar remains scrollable on short screens. Home retains its free-flow
   dashboard layout and media pickers retain their dialog sizing.

Focused tests: `navigationStudioWidget`, `navigationStudioData`,
`pageManagerWorkspace`, `runtimeAdminGrid`, `plainSpaceAdminPageSeeding`,
`contentHeaderActions`, `runtimeGlobalBackground`, `pageListParentReassignment`,
`dashboardStudioStyles`, `widgetPanelCatalog`, `galleryWidgetNavigation`,
`designStudioPublicWidgets`, `designerLayoutsWidgetStates` and `customSelect`.
Run these together with `npm run test:ui` and `npm run build`.

## Local verification — 2026-09-05

- Fixed workspace height follow-up: the style build and all 10 dashboard-style
  tests passed. Browser geometry confirmed zero gap between the media card and
  bottom navigation at desktop and phone widths, with no document overflow.
  A short dark-mode viewport retained internal scrolling; Page Manager also
  reached the bottom navigation without expanding the document.

- Production build passed. UI suite: 112 suites / 596 tests passed. Additional
  facade, registry, seeding and Navigation data suites passed; final Navigation
  target filtering has its own focused retest. Scoped lint passed.
- Browser checks confirmed fixed composition, hidden layout controls, three-level
  page hierarchy, retained input across filters and shared light/dark surfaces.
  Public image thumbnails and selection details loaded in the Explorer in dark
  mode. Its narrow layout stacks the file pane and details; folder paths scroll
  within the breadcrumb strip. Phone-size Page Manager selection and Page Editor are usable without document
  horizontal overflow. Temporary viewport and theme overrides were restored.
- Created one local verification draft, staged SEO and a design attachment,
  confirmed navigation-away protection, saved once and reloaded both values.
  The verification draft was then soft-deleted through the editor. No existing
  public page was published or modified by that save test.
- The shared Explorer now has folder history, a lazy folder sidebar, explicit
  selection, sortable file columns and optional public-image previews. Picker
  insertion is explicit and respects its accepted file types. Real local folder
  creation, rename, open/back and delete passed after correcting JSON mutation
  acknowledgments; the temporary folder was removed.
- Settings guard independent tab drafts and pending saves. Media tests cover
  out-of-order folder responses, retained load errors and duplicate operations.
  Widget-library tests cover failed usage scans, search and local templates.
- Browser verification found and fixed the picker loading deadlock caused by
  local dialogs occupying the HTTP command queue. A regression test exercises
  a nested media request through the same client while the dialog remains open.
  The fixed picker was then opened from Design Settings, navigated into the
  existing site-assets folder and selected a compatible image. The explicit
  confirmation became available; the dialog was closed without changing settings.
- Removed the unused widget-registration startup request after confirming there
  is no Widget Manager handler. Permission checks remain on actual facade calls;
  no fake acknowledgment or dynamic grant was introduced.

## Agent handoff and neutral theme verification — 2026-09-06

- Production build passed. The final UI suite passed all 120 suites / 629 tests.
  Focused AgentManager, Agent Access, facade, preset and color-library checks
  also passed. Scoped lint passed; broader lint still reports existing
  `@ts-nocheck` directives in Designer header/publication files.
- Live commands used the existing Agent Access and AgentManager HTTP endpoints.
  Page search changed the visible list. CMS-to-Designer navigation was
  acknowledged before the separate document loaded, and a section update
  appeared in the inspector and storyboard.
- A stale command during an uncommitted inspector input was rejected with
  `CMS_AGENT_STATE_CHANGED`; the person's input remained intact. The temporary
  Designer draft was closed without saving. Save-failure recovery, draft handoff,
  duplicate-write protection, acknowledgment errors and the shared publish
  promise were covered by focused regression tests.
- Browser geometry confirmed that page selection, its button and the list share
  the same left edge, with no inset selection stripe. Neutral buttons and
  selected rows were checked in light and explicit dark mode. The current local
  installation's account colors and Default palette were updated through the
  existing administration facade and read back successfully.
- These checks did not publish an existing page or deploy to YiTaiCOS.

## Release limits

The combined 0.10.0-rc.1 source snapshot includes the completed CMS workspaces,
shared rendering, agent controls, neutral theme, notifications and core-update
preview. The unfinished measured HTML importer and its shared-file changes are
excluded. Build artifacts are regenerated from that snapshot. The release uses
GitHub prerelease status while real host update acceptance remains pending.

The local seeded database is not proof of YiTaiCOS production behavior. No commit,
push or deployment is implied by these checks. Release acceptance still requires
nested public routes, draft visibility, publish/preview parity, module-specific
imports/exports and real media operations against the intended production storage.
