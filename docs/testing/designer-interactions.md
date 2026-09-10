# Designer interactions: local acceptance

Classification: small maintenance / Zero-Node neutral. Existing UI, Designer,
public-content and widget service authorities remain in place.

## Verified path (2026-09-10)

- [x] Canonical CMS runtime with an isolated SQLite snapshot; no original or production database writes.
- [x] Visible Designer: native UI-kit input plus a separate container; Events & data selects published articles, input trigger, fields and a nonempty-query condition.
- [x] Existing AgentManager container.settings.set and shallow state feedback expose the same saved rule.
- [x] Designer save, reload and public page exercise the persisted document.
- [x] Public search returns real published content, including Chinese query and no-results states.
- [x] Popover, modal dialog and drawer use the existing container; Escape/close retain controls and hide the container.
- [x] Public stylesheet/font choices stay local; admin theme is unchanged.
- [x] Reviewed v2 ZIP installation retains the registered widget ID, code-hash receipt and named grants.
- [x] Installer repairs missing package files only with explicit replacement plus update permission.
- [x] Settings-backed grants survive the real scalar-text persistence boundary and runtime restart.
- [x] A private consumer exercises a fixed editable composer, inline articles, keyboard selection, language navigation and unfinished drafts.

## Limits and release gates

- [ ] Signed release and production installation of these changes.
- [ ] Authenticated consumer login/session, tenant denial, message persistence and its real reply stream against a combined backend.
- [ ] Physical mobile keyboard / OS Chinese IME acceptance. Browser Chinese text and synthetic IME regression tests do not establish this.
- [ ] Full pixel parity with a consumer's former HTML design. The responsive native header now wraps; it is not claimed as an identical mobile screenshot.

The Designer source picker currently supplies published public articles and explicit
sample data. Other business sources require their module's reviewed operation.
This is local event/state/condition wiring, not a durable backend workflow engine.
