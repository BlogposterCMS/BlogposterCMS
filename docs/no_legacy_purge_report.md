# No-Legacy Purge Report

This report records the production cleanup that removed the last active
pre-v1 runtime contracts from BlogposterCMS. It separates active contracts from
data migration paths so future work does not reintroduce aliases or shim trees.

## Current Decision

BlogposterCMS should be treated as a v1-first codebase:

- Browser and app callers use Runtime Manager resource/action facades.
- Core-owned browser apps use `cms-app-runtime-request` and
  `cms-app-runtime-batch-request`.
- Public widget/layout loaders pass state through explicit loader context.
- Designer data is owned by `mother/modules/designerManager`.
- Bundled widgets resolve from `/ui/widgets/plainspace/...`.
- Community widgets resolve from `/widgets/{folder}/widget.js`.
- Static module frontends declare `staticFrontend: true`.

## Removed Runtime Contracts

- Removed the global public layout handoff through `window.__BP_ACTIVE_LAYOUT__`.
  Design and widget loaders now share active layout through `ctx.activeLayout`.
- Removed app bridge aliases `cms-runtime-request`,
  `cms-runtime-batch-request` and `cms:runtime-*`. The only direct app runtime
  bridge names are `cms-app-runtime-request` and
  `cms-app-runtime-batch-request`.
- Removed `/plainspace/widgets/*`, `/plainspace/main/*`,
  `/plainspace/dashboard/*`, `/plainspace/grid-core/*` and
  `/plainspace/sanitizer.js` browser shim files. Public PlainSpace keeps only
  active shell partials.
- Removed the optional `modules/designer` backend package. Designer service,
  placeholders, schema and public loader now live under
  `mother/modules/designerManager`.
- Removed `grapesComponent` module metadata and replaced it with
  `staticFrontend`.
- Removed widget metadata `apiEvents`; widgets now declare `apiActions` as
  `{ resource, action }` descriptors.
- Removed the running `canAccessEverything` permission bypass. Startup can still
  upgrade older stored admin role blobs to `'*': true`, but tokens and runtime
  checks only grant the wildcard permission.
- Renamed WordPress import-plan term provenance from `legacyWordPressTerms` to
  `sourceWordPressTerms`; import reports now describe origin data without
  advertising an alternate runtime contract.

## Active Migration Boundaries

Some import and self-heal flows still consume older stored data shapes by
design. They must not expose alternate runtime APIs:

- Pages Manager mirrors source page rows into Content Engine through
  `sourceModule: "pagesManager"` and `sourceId`.
- Coming Soon seed upgrade detects a retired raw HTML seed page only so it can
  attach the current Design Studio seed without duplicating pages.
- Permission startup normalizes older admin role blobs and removes retired broad
  keys from the stored permission payload.
- Importer, redirect, metadata, SEO, media and search domains may describe
  imported/source-owned records; those terms are data provenance, not runtime
  compatibility contracts.

## Guardrails

- UI architecture tests reject retired browser implementation imports.
- Widget module-path tests reject retired PlainSpace widget URLs and allow only
  canonical bundled or community widget paths.
- AppLoader tests keep user-managed apps on query-only `cms-admin-request` and
  reserve direct runtime bridge calls for core-owned apps.
- Runtime Manager tests verify app-origin write restrictions and resource/action
  facade routing.
- Build output must be regenerated after source changes so `public/build/*`
  does not serve stale contracts.

## Verification

- `npm run build`
- `npm test -- --runInBand tests/appFrameLoaderData.test.ts tests/appFrameLoaderSecurity.test.js tests/appLoaderBoundary.test.js tests/runtimeManager.test.js tests/widgetManagerPublicLoader.test.ts tests/designerPublicLoader.test.ts tests/pagesManagerPublicLoader.test.ts tests/runtimeCanvasItems.test.ts tests/widgetModulePaths.test.ts tests/widgetModuleRenderer.test.ts tests/plainSpaceWidgetRegistry.test.js tests/uiArchitectureBoundaries.test.js tests/builderPermission.test.js tests/pageContentMirror.test.js tests/pagesManagerEnvelopeLayout.test.js tests/pagesManagerComingSoonSeed.test.js tests/sharedLayoutDocument.test.ts tests/commentsManagerEvents.test.js tests/moduleHost.test.js tests/meltdownHttpPolicy.test.js tests/searchManagerEvents.test.js tests/dashboardStudioStyles.test.js tests/moduleProcessRuntime.test.js tests/moduleInstallerService.test.js tests/moduleAccessConsent.test.js tests/designerManagerCore.test.js tests/designerSaveDesign.test.js tests/publicLoaderPaths.test.ts tests/widgetEvents.test.ts tests/runtimeWidgetEvents.test.ts tests/runtimeWidgetRenderer.test.ts tests/themeImporter.test.js`
- `git diff --check`
- `rg` scans over source, docs and `public/build` for retired event names,
  widget URL roots, layout globals, `apiEvents`, old Grapes metadata and old
  WordPress import-plan names.

## Allowed String Residues

- `canAccessEverything` may appear only in denylist, startup normalization and
  regression-test code that removes or rejects that retired permission key.
- `legacyHeaders` is the external `express-rate-limit` option name. It is not a
  Blogposter runtime contract and remains set to `false`.
