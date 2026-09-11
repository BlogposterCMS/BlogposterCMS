# Content editor and locale release checks

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
