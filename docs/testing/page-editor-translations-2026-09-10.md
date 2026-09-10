# Page Editor translation verification

Classification: small maintenance; runtime-neutral. The existing Pages facade
and translated storage remain authoritative. No new permission or transport.

- [x] Seven focused suites passed, 134 tests: page editor data/workspace, content
  fields, article contract/dialog, Pages mirror and UI architecture boundaries.
- [x] The final projection-cache correction passed the three affected suites
  again (26 tests). The final full focused run also covers nested Mongo translation
  responses and absent locales. Browser TypeScript compilation passed.
- [x] Full production build passed; the existing lazy article bundle size warning
  remains. Build cleanup of retained historical chunks was restored before commit.
- [x] In the local CMS, open a saved English guide, switch to its Chinese
  translation, edit a draft and attempt another language. The draft is retained
  with `PAGE_EDITOR_LANGUAGE_PENDING` until Save or Discard.
- [x] Save through the real Page Editor, reload with `contentLang=zh`, then reopen
  English. Titles, HTML, CSS and shared inherited layout remain correct.
- [x] Save the existing English content CSS through the same native Save action.
  Both public locale reads return HTTP 200 and the same canonical content ID,
  with their own titles and article HTML.
- [x] Inspect the new language control in a narrow browser viewport: field and
  button wrap and remain reachable. Reset the temporary viewport afterwards.
- [ ] Verify the signed release and repeat the flow on the deployed engine.

The translation editor does not generate translations automatically. One page
owns its shared address, status, tags and design; each locale owns its translated
title, content, CSS and SEO. Existing native widget translation settings remain
independent of article text. Public content publication is a separate action.
