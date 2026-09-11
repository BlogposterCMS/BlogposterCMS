# Content editor and locale release checks

## Styled editor tooltips

Classification: small maintenance; Zero-Node neutral. Presentation and overlay
dismissal only; no content, permissions or agent command boundary changes.

- [x] Focus/hover hints use the shared portal and accessible descriptions without native titles.
- [x] Disabled controls explain availability; moving onto a hint keeps it open.
- [x] Escape dismisses the hint while preserving the editor and keyboard focus.
- [x] Hover preserves open language pickers; teardown cancels pending hints.
- [x] Local real article editor: header/toolbar, 390 px edges, light/dark and reopen.
- [x] Twelve focused regression tests, lint and browser build pass.
- [ ] Production CMS update and verification remain deferred.

## HTML/CSS source presentation

Classification: small maintenance; Zero-Node neutral. No backend, storage,
authorization or content-publication boundary changed.

- [x] Open imported HTML without changing its bytes, title, attachments or language.
- [x] Check syntax colors, line numbers, fold controls, Find and line wrapping.
- [x] Switch HTML/CSS, format only the active draft, undo, save and reopen.
- [x] Match AgentManager view/format/edit/save behavior and retain link feedback.
- [x] Invalid, stale and oversized formatting leaves the current source unchanged.
- [x] Verify the plain editing fallback when the local code bundle cannot load.
- [x] Verify local desktop/narrow layout, browser build and focused tests.
- [ ] Production CMS update (separate from source publication).

Local verification: 18 focused tests pass and the browser build succeeds. Native
Pages editing covers format/undo, search, wrapping, HTML/CSS, save and reopen;
existing source and asset references remain intact. AgentManager view/edit/format
commands run through the authenticated facade, including stale-revision rejection.
Desktop 1440 px and narrow 390 px dialogs remain within the viewport, with light
and dark source colors. The source editor is a lazy 487 KiB bundle; Webpack keeps
its size advisory, alongside the existing article-editor advisory. Formatter
formatters load only when formatting is requested.

Classification: material backend extension in existing Pages/Designer authorities;
Zero-Node neutral. No new service, database, content authority or schema migration.

- [x] Pure sparse-delta tests: stable IDs, source updates, regional inheritance,
  locale/viewport isolation, legacy widget translations and prototype-key rejection.
- [x] Article model: gray source fallback, edited/removed blocks and preserved IDs.
- [x] Local native article: open with brush, switch to zh-CN, edit title/body,
  save and verify independent English/Chinese rows with the same block ID.
- [x] Local native Designer: translated widget text saved as a sparse delta;
  original metadata retained. Public facade returns English 180 px and Chinese
  240 px mobile geometry, with unchanged desktop placement and no override catalog.
- [x] Final focused test gate: 46 suites / 247 tests; browser build succeeds with
  the existing lazy article-editor size advisory (498 KiB). The final popover
  integration is additionally checked with the shared select/toolbar tests.
- [x] Browser reload retains zh-CN; document/Studio round trip reattaches the same
  design (24) and preserves page 59's English/Chinese content and translation IDs.
- [x] Native inherited reset creates design 23 version 7, removes only the chosen
  variant and keeps the base widget and responsive placement unchanged.
- [x] Central Settings checkbox selection/save: English and Chinese appear in
  Studio's language dropdown; unchanged/reset-unavailable controls are disabled.
- [x] Article toolbar disables link/media-description/undo/redo when unavailable;
  focused schema/history tests cover selection, code blocks and selected media.
- [ ] Production update and public verification: deferred by the site owner.

The renderer compatibility layer does not rewrite existing attachments. Source
commits, a CMS package update, article publication and live verification are
separate milestones. These generic editor changes do not change a YiTaiCOS ERP
workflow; Blogposter's owning authoring docs are updated here.
