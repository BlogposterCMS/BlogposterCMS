# Designer consolidation verification

Verified locally on 2026-09-05.

## Current ownership

Design Studio owns document authoring and full-document manual/automatic saves.
Layout is the hierarchy view of the same document, not a second editable layer.
The retired grid-template creator and unused Designer page renderer are removed.
The old stored widget URL delegates to the existing Designer library; existing
public template data keeps its read compatibility. No stored public content is
deleted by retiring the authoring UI.

`isDynamicHost` identifies the saved content destination independently of active
Section selection. Direct page HTML and attached content can occupy that host.
Nested `designRef` documents retain their structural renderer with cycle/depth
protection. Free pixel geometry survives runtime normalization.

## Evidence

- 19 focused suites / 92 tests passed for composition, structural save, modes,
  seeding, library navigation and existing Free/Auto/Grid interaction contracts.
- The canonical HTML sanitization regression passed after removal of the unused
  Designer page loader (one additional test).
- `npm run build` passed, including styles, browser TypeScript and Webpack.
- Local browser: saved and reopened `Designer composition verification` (design
  2); the Features content host and nested Container survived.
- Local browser: changed Features padding to 12px, reloaded without manual Save,
  and verified automatic persistence of padding, host and Container.
- Local browser: Layout tab preserved active document layer 1 and canvas pointer
  interaction. Free mode hid Direction, Columns, Gap and Alignment.
- Local browser: the retired Layouts link was absent; Design Studio remained.

The wider architecture suite reported two assertions against concurrent admin
grid changes outside this task. The changed Designer/page-editor architecture
checks passed separately. This is local verification, not a deployed acceptance
test. The test design remains available locally for inspection.
