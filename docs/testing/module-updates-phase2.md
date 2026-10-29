# Individual module updates: acceptance

Status: implemented and published; production acceptance is in progress below.

## Implemented

- All 37 CMS modules and 31 bundled widget entries use the existing signed package,
  compatibility, review and durable selection path. Each has its own changelog.
- Backend event handlers, HTTP routes and owned timers drain before replacement.
  Failed readiness retains the old implementation. Admitted asynchronous chains
  finish, including nested calls and database work after a response timeout.
- Host-owned permissions, engines, schema registration, registries, queues and
  delivery loops retain canonical instances. Changes to shared contracts require
  a compatible host release.
- Designer carries its owned browser assets. Widgets carry their entry code.
  Open documents retain their version; new documents use the selected generation.
  Shared ES imports keep canonical URLs. Two verification workers queue concurrent
  dashboard requests instead of rejecting the third widget.

## Local evidence, 2026-09-09

- The curated release checkout builds successfully with TypeScript and webpack.
  It excludes unrelated concurrent UI work from the shared checkout.
- Regression coverage includes every module policy, actual handler replacements,
  package ownership, signed notes, draining, readiness recovery, retained state,
  browser generations, concurrent widget loads and durable selection.
- The isolated CMS on port 3400 uses a copied database and test release transport.
  Designer was installed in the Update Center and opened successfully in the
  browser, including after a deliberate runtime restart.
- Auth, Database, Runtime, Updater, Analytics and the Logo widget were individually
  installed through browser confirmation under the same PID 23396. Successful
  durable selections were recorded separately from UI status.
- Windows transient staging locks have bounded retries before any activation.
  Signature and compatibility failures are never retried.
- A broad shared-checkout run passed 374 suites / 2098 tests and failed 3 suites /
  6 tests in UI architecture, dashboard styles and page-list filtering. These
  unrelated source changes are excluded from the curated release checkout.

## Remaining acceptance

- The combined restart initially exposed a database schema-path bug. Both schema
  bridges now use the canonical host boundary; the regression passes. The corrected
  database generation was installed in the browser and all selected generations
  started together under PID 44016; Designer reopened successfully.
- Curated checkout: 372 suites / 2062 tests passed (12 skipped), followed by 76
  focused regressions after the final fixes. Build and placeholder parity passed.
  All 67 unsigned local package manifests were produced successfully.
- Signed Linux package production remains pending.
- Publish a compatible baseline and subsequent module release; test production
  installs, browser behavior and persistence. Earlier five-module production
  acceptance does not cover this expansion.

The local fixture substitutes transport and attestation verification. It is not
proof of production signatures and introduces no production bypass flag.

The 0.10.10 workflow was cancelled before publication when final review found that
widget changelog edits incorrectly changed host compatibility. A regression now
proves notes-only edits remain compatible while shared-code edits do not. The
corrected signed baseline is 0.10.11; the earlier tag remains immutable.

## Session continuity follow-up

A browser test of User Management exposed an existing HTTP error path that cleared
admin cookies when token validation depended on a paused module. HTTP adapters now
return retryable availability responses and keep cookies; invalid-token handling
remains fail-closed. Eleven HTTP regressions cover shell/login, installation-status
queries, individual/batch facade calls, recovery and actual invalid credentials.

The full curated suite passed 373 suites / 2075 tests (12 skipped). Later focused
HTTP checks cover the added installation-status cases. Local automatic login was
disabled, User Management was held before activation, and browser page requests
were exercised during the pause. After release of the hold, a new Home tab rendered
using the existing session without a login; selected update PID was 23200.

The 0.10.11 and 0.10.12 workflows were cancelled before production deployment to
include this correction. Version 0.10.13 is the prepared baseline. Publication is
coordinated with the agent publishing other completed work; expanded production
acceptance remains pending.

All original 36 modules and 31 bundled widgets were subsequently installed through
the actual local browser dialogs under PID 23200. A deliberate cold start under
PID 19372 loaded all 67 selected generations, with every lifecycle active. The new
GeoIP module was then present as a host generation; its separate acceptance follows.

GeoIP was individually installed through the browser under unchanged PID 35872.
The subsequent deliberate cold start (PID 17520) restored all 68 selected packages
(37 CMS modules and 31 widgets), all active. Update Center reported modules up to
date and Designer rendered after reload. Release 0.10.13 preflight produced all
68 package manifests with nonempty package-specific release notes.

After integration of main 56667e26, the release build and placeholder parity passed.
The full suite passed 385 suites / 2146 tests (12 skipped); the final two focused
GeoIP regressions also passed, including HTTP transport after scope retirement.

Production 0.10.13 exposed a missing GeoIP startup entry: its signed package was
correct but activation failed closed with CORE_MODULE_NOT_STARTED. The prior
source fixture contained that entry, while the curated release did not. Version
0.10.15 corrects the actual bootstrap list. A regression now checks both directions
between the startup registry and package policy; it failed before the fix.

The corrected curated checkout started all 68 lifecycles under PID 43156, including
GeoIP. All 57 focused bootstrap/policy/GeoIP/package regressions passed after the
previously failing catalog-equivalence assertion was corrected by registration.

## Signed production acceptance

The official 0.10.13 image was installed with the existing host updater, backup,
signature checks and readiness check. Release 0.10.14 supplies compatible signed
module packages; the two releases have identical host compatibility fingerprints.

All 31 bundled widgets and 35 backend modules were individually installed using
the production Update Center dialogs. Package-specific notes were displayed.
Container PID 1091006 remained unchanged throughout all 66 installations and the
container remained healthy. Importer staging hit a release-download timeout;
GeoIP activation failed closed because the baseline lacked its startup entry.
Neither failure replaced the running implementation.

The 0.10.15 registration correction and compatible 0.10.16 packages were published.
The prepared 0.10.15 image passed offline runtime-integrity verification (13,758
managed files, no blocked modules). Subsequent direct GitHub release downloads
from production timed out while the GitHub API remained reachable. Transport
failures are separate from completed lifecycle replacement and signature checks.

The deliberate 66-package cold start preserved every selection but exposed a
main-loop starvation failure: synchronous verification delayed database replies,
causing contentEngine to be deactivated by a timeout. Container health alone did
not establish acceptance. Selections were preserved separately for investigation;
the normal signed updater then restored bundled 0.10.15 with backup and readiness
checks. The temporary release pin was removed.

The correction moves cold-start inspection to the existing verification worker.
Bootstrap regressions cover I/O progress before selected generations start and
fail-closed startup when signature inspection fails. Production cold-start
acceptance remains open until the corrected signed release is exercised.
### Multi-selection acceptance (0.10.20 source)

- All 387 local suites passed: 2,157 tests passed, 12 skipped. Build and generated backend event contract check passed.
- Browser: default selection across CMS modules and bundled widgets, deselecting one item, exact three-item confirmation, and disabled empty selection verified.
- A local fixture used the real queue and UI with simulated activation: after navigating away, two selected packages completed, one deliberate readiness failure remained visible, and the unselected widget remained available. This does not establish signed production package acceptance.
- Actual local CMS Update Center checked in System and Installed tabs, including disabled disconnected state and a 390px viewport.
- Production before this release remains host 0.10.17 with 61 selected 0.10.18 generations and unchanged PID 1103820. New selection UI and all-package cold-start production acceptance remain pending.

### Paused after user feedback (2026-09-09)

Host 0.10.20 is deployed and healthy (PID 1112664); the checkbox UI is visible in production. Signed release 0.10.21 is published, but no 0.10.21 module batch or final host deployment has been started. Complete 68-package activation and cold-start acceptance remain open. Package checks encountered time-dependent GitHub connectivity failures. The temporary container DNS overrides were removed and the original updater discovery configuration restored. Further testing/deployment is paused at the user's request; ask before extended network troubleshooting. See AGENTS.md.

### Scheduled attempt (2026-09-09, 21:00 Europe/Zurich)

The current published release 0.10.21 includes the completed main publication 56667e26. The initial bounded production connectivity check succeeded, but the subsequent Update Center package check ended with only 31 of 68 packages ready and RUNTIME_INTEGRITY_DOWNLOAD_TIMEOUT errors. No package batch or host apply was started. Production remains healthy on host 0.10.20 with unchanged PID 1112664. The official 0.10.21 image was transferred, reconstructed with layer/config verification and loaded for staging only; staging is not deployment. All-package activation and cold-start acceptance remain pending. The one-shot automation is paused; further retries or network work require Matteo's answer under AGENTS.md.

### Manual full-release deployment and local audit (2026-09-09, 23:20 Europe/Zurich)

After explicit user approval, one further package check again encountered RUNTIME_INTEGRITY_DOWNLOAD_TIMEOUT. The ordinary host apply then stopped at CORE_UPDATE_MANIFEST_BUNDLE_DOWNLOAD_FAILED before replacing the runtime. Official release metadata and detached bundles were copied over SSH. A temporary operator script sourced the installed updater and supplied only the three exact uploaded v0.10.21 metadata assets; signature, release identity, OCI provenance, backup, readiness and rollback logic remained unchanged. The previously transferred image passed runtime integrity (13,758 files, zero blocked modules). The normal apply completed with CORE_UPDATE_APPLIED for 0.10.21 and container health healthy (PID 1136580). This was a complete host release update, not a successful 68-package hot-update batch; that acceptance remains open.

Browser: existing session rendered Home, populated Media and the Design Studio listing. Opening the actual Designer caused a login redirect, so authenticated canvas/deep-link acceptance remains unverified. No content was modified. The scheduled automation remains paused.

Local root audit against release commit 962b9ff7: 464 modified/untracked paths; 344 already match the release. Remaining differences include stale shared-helper implementations, release/build metadata, local AGENTS guidance, notes and a genuinely unpublished updater download/cancel/resume implementation (including deploy/download-update-image.js and updater protocol 1.3.0). No matching download-descriptor producer or focused downloader tests were found in tools/tests during this audit; do not represent that work as complete or blindly deploy the old root checkout.

### Manual production rollout (2026-09-10)

Source commits 90834086 (download/resume/cancel), 06717db4 (article test geometry), c3b00fc7 (signed installed release notes) and 808441ce (exclude release text from host compatibility) were pushed to main. Focused updater/UI tests passed (37), existing release/updater tests passed (18), packaging/integrity tests passed (16), and final module compatibility/release metadata tests passed (20). These groups overlap and must not be added into a unique test total. Browser fixture verified progress, cancel, resume and navigation; it used simulated download state, not production activation.

Signed releases 0.10.23 and 0.10.24 passed their full release pipelines and were manually transferred as verified image-layer deltas and detached metadata bundles. The existing updater retained OCI provenance, exact version/digest, native checks, backup and rollback. Attested host controls 1.3.0 are installed. Production last verified healthy on 0.10.24 with CORE_UPDATE_APPLIED; installedRelease notes are present. Its Update Agent was reconciled through its ordinary verified check using uploaded metadata. Global discovery configuration remains unchanged. Home, populated Media and the actual Designer canvas were inspected in production on 0.10.23 without editing content.

Release 0.10.25 (808441ce) adds the necessary regression protection: signed root changelog changes must not force host upgrades for module-only releases. Its CI tests passed and CodeQL was running at the last reachable status. The final pipeline result and transfer are not verified: GitHub API polling failed, and one direct release metadata download then timed out. Per AGENTS.md, further network attempts stop pending Matteo's answer. 0.10.25 is pushed, NOT deployed. The scheduled automation remains paused. Full 68-package production hot-update batch acceptance remains open; these manual deployments installed complete host releases.

ACR inspection (2026-09-10): existing private yitaicos-github-main/blogposter-cms repository in Hangzhou already enables automatic tag builds and overseas builders. Its 0.10.25 checkout succeeds at 808441ce, but source builds fail because externally produced .release-integrity manifest, bundle and trusted-root inputs are absent. GitHub release pipeline 34411466822 is now confirmed successful; official image archive and signed metadata downloaded locally, archive SHA-256 matched the release descriptor and manifest attestation verification succeeded. Existing server VPC registry credentials are present. Direct SCP was aborted after low throughput; no ACR image push or production replacement occurred. Consider a dedicated ACR mirror Dockerfile using only the verified upstream image digest through the overseas builder, followed by source/config identity validation before deployment; not implemented or triggered.

ACR overseas transfer started (2026-09-10): operational branch codex/acr-release-mirror at a3c78e0f adds an import-only Dockerfile pinned to the official 0.10.25 digest 93258193a3e20c6785c12ea41573926d9c4e08aacc2de38d1322ef402823144c. Six container boundary tests passed. Added one existing-repository build rule for that branch, /deploy/acr-release, Dockerfile, linux/amd64, destination tag 0.10.25; launched exactly once, build ID 01A089B8-1474-55CF-8CED-6C4B7840519A. ACR fetched the exact branch commit and accepted the Dockerfile; logs show transfer of the official image layers, with no source rebuild. After roughly eight minutes, two larger layers were only 8.39/27.82 MB and 6.29/14.64 MB. The job is still Building, not a published image. No second build was started. Small release metadata and official config were copied to the server; host-side manifest attestation passed. The existing runtime was verified healthy on 0.10.24; no replacement, mirror config change or final browser acceptance occurred. ACR transfer continues independently; ask before prolonged monitoring under AGENTS.md. ACR may serialize the image config differently: verify rootfs and runtime config against official-image-config.json and offline runtime integrity before any mirror deployment.

ACR source-build change (2026-09-10): at the user's request, the slow import job above was canceled (1660 seconds). Source publication c1e9abcf replaces the import Dockerfile with the canonical root Dockerfile's verified-input preparation. Real official 0.10.25 manifest/bundle retrieval and GitHub attestation verification passed locally. ACR's existing rule now watches immutable acr-vVERSION tags created after release asset publication. The source builder obtains public trust roots through the pinned verifier's TUF policy, retains exact managed-file verification and does not sign locally. Separate module/widget packages and their GitHub download URLs remain unchanged.

Release 0.10.26 stopped on one stale Dockerfile assertion (2166 tests passed); e5b07d05 corrects all three signed-input copy assertions. Release 0.10.27 was canceled after confirming the slim base lacks an OS HTTPS CA bundle. Source 217cd61b, release 0.10.28, supplies that bundle from the existing verifier stage. All 45 focused tests passed, and the full release tests passed; CodeQL/signing are pending. Duplicate main CI was canceled to avoid redundant Actions usage while the complete release gate runs. Production was rechecked running/healthy on 0.10.24. Candidate operator files are staged only; no ACR source image, production replacement, or final browser acceptance has yet been verified. Existing scheduled automation remains paused.

### Verified ACR source build and production installation (2026-09-10)

Release 0.10.28 completed all signing/image checks, but its promotion lookup mistook a GitHub 404 response body for an existing tag. Commit 672d65bf fixes the lookup using exact filtering of matching refs and covers missing/same/conflicting tags and transport failure with the actual workflow shell block. The immutable acr-v0.10.28 signal was published manually at the unchanged release commit. ACR source build 47e905f0-db35-45a3-beb1-dacf0db0944c1 succeeded in 290 seconds and published cb7337f7033902d1c2154e98f19250d19a9f824c791f6d653cdd426d81cd5c00. VPC pull succeeded, but the mandatory non-root offline check rejected owner-only downloaded signature files. This image was never installed. Changing only those public file modes inside a disposable test container proved the remaining signed runtime/native checks under the node user (13,759 files, zero blocked modules).

Commit 22f6e848af17b34b0893153d4a5fdbb185f4e000, release 0.10.29, normalizes the three public inputs to 0644 only after signature verification. Fifty focused tests passed; Linux CI additionally checks actual POSIX modes. Full release workflow 34457621823 passed, including tests, CodeQL, signatures, offline final-image verification and automatic promotion. GitHub delivered the promotion push to ACR successfully. ACR build 2fb79f36-b367-404c-b8b0-2d444ad6e1611 checked out the exact commit and succeeded in 306 seconds. Its immutable Linux amd64 digest is 5e2729e85a47cb4ddb9a86a12f3925bc75cce5f5743fd2d7a99731878cf2ca9e; the VPC pull returned the same digest.

The unmodified ACR image passed the server's network-disabled check as its non-root user: exact version/commit, enforced integrity, 13,759 managed files, zero blocked modules, native dependencies and installed release notes. The standard updater then installed that pinned ACR digest using the existing reviewed registry-mirror mode and manually uploaded, verified official release metadata. It reported CORE_UPDATE_APPLIED at 2026-09-10T09:14:21Z. Production is running/healthy on 0.10.29 with zero restarts; the public readiness endpoint reports BLOGPOSTER_READY and 0.10.29. All four backup archives and the previous 0.10.24 image remain available. Rollback was not executed. The Update Agent's ordinary verified check was reconciled to current / 0.10.29 / available false / no error, and its service is active.

Browser acceptance remains open: reloading the existing Update Center tab redirects to the normal CMS login after session expiry. Requested user re-login before testing Update Center, Media and the actual Designer canvas. This release was a full host replacement, not a demonstrated 68-package production hot-update batch. Individual module/widget updates remain supported for compatible hosts with their existing signatures/changelogs/selection; shared host changes still need a host update. Global discovery and individual package download URLs still use GitHub; this operation pins the reviewed ACR image only in its version-specific operator config. Scheduled automation remains paused.

### Authenticated production browser acceptance (2026-09-10)

After user re-login, the live browser confirmed System 0.10.29 / Up to date, the installed 0.10.29 release notes, and current CMS module / bundled widget status. Direct navigation back to Update Center worked. With no available candidates, the global selection checkbox and Update selected (0) action were disabled as expected; this did not exercise a production update batch or per-component candidate changelogs.

Home and Page Management loaded existing content. Media folder navigation reached the populated public/site-assets folder (19 items), with existing image names, types and sizes rendered. The saved System / Coming Soon design opened in the actual Designer canvas with its widgets, toolbar and inspector. Reloading /admin/app/designer/1 restored the same canvas. Screenshots were inspected at the browser's existing 984-pixel viewport. No content was edited, saved or published; no new build/deployment was triggered.

One visible Update Center warning remains: Installed reports Some modules could not be checked. The Modules page identifies the sole installed community example, dummyModule 0.1.0, and shows E_MODULE_UPDATE_SOURCE_PROVIDER: its update source must use provider github. This is a module source-configuration rejection, not an observed ACR pull or production runtime failure. Its configuration was not changed. Home also reports potentially incomplete analytics and has no saved design preview; the actual linked design loads correctly. The complete 68-package production hot-update batch and responsive browser acceptance remain unproven.

### Designer changes deployed through ACR (2026-09-10, 0.10.30)

New main commit cda9d26f contains the completed Designer container events/data and isolated widget UI work. Its CI exposed a shared-to-feature import and a jsdom DOMRect assumption. Release commit d3c6089ddf3dd0e412e704299a74f6cfa8bc592c moves the unchanged widget service implementation into shared UI with compatibility exports and uses existing element geometry in the article test. All 139 focused tests and the local build passed. Full signed release workflow 34467529238 succeeded; duplicate main CI 34467529163 was canceled to avoid redundant Actions usage. Main, v0.10.30 and the automatically generated acr-v0.10.30 point to the reviewed release commit. The old shared dirty checkout was preserved.

ACR build d2caff03-b666-490f-87e3-3d5706f261fc1 checked out that exact source and succeeded in 175 seconds. Production pulled its VPC image at sha256:8abb5a633777bbe9fefcf688c9c016e065947ce76b7c500dd6a6997d874eef22. The three small official release metadata/bundle files were transferred manually. Host-side manifest verification passed. The unmodified image passed network-disabled verification as its non-root user: exact version/commit, enforced integrity, 13,786 files, zero blocked modules, native dependencies and installed release notes.

The existing updater applied 0.10.30 at 2026-09-10T11:03:17Z and returned CORE_UPDATE_APPLIED / exit 0. Container running/healthy with zero restarts; the public readiness endpoint returned BLOGPOSTER_READY / ready / 0.10.30. Four fresh data archives and the previous 0.10.29 image remain available; rollback was not exercised. The Update Agent's ordinary verified check was reconciled to current / 0.10.30 / available false / no error and its service is active.

Authenticated browser acceptance confirmed the Update Center's 0.10.30 version and new installed changelog after reload. The existing Designer document loaded by direct link. In its desktop inspector, the new Minimum width field and Events & data / Static container control are present; the canvas and controls were visually inspected at 1280x850. The temporary viewport was reset and Update Center left open. No production document was edited, saved or published: production persistence/stream/IME acceptance of a newly configured interactive consumer is not claimed. Global discovery/package URLs and the paused automation remain unchanged.

### Latest CMS release prepared; ACR network timeout (2026-09-10, 0.10.31)

- Fast-forwarded the curated release checkout to a331a229 and published release
  0.10.31 at 78a02d78e4ac7a8fa5fc35f25b4fef53e16af208. Only package versions
  and the changelog release heading were committed; unrelated local notes remain private.
- Source CI 34473753496 and full signed release 34474660253 succeeded. Cancelled
  duplicate same-commit CI 34474660260 after the release pipeline started.
- Official update manifest and two attestation bundles were transferred to the
  server's version-specific operator directory. Manifest verification succeeded
  against the exact release tag, source commit and official signer workflow.
- ACR source job 74ca23ba-2ca9-42b4-b1f9-0f4d937462221 checked out the exact
  release commit, then failed after 220 seconds. Its final log lines 431-446
  report RUNTIME_INTEGRITY_DOWNLOAD_TIMEOUT after 5.081 seconds while preparing
  signed integrity inputs; compilation had completed. No manual retry was started.
- Production remains 0.10.30, running/healthy with zero restarts. No 0.10.31
  apply was invoked. Operator scripts are prepared, but no new digest/config
  has been selected. Before further retries, obtain the user's decision under
  AGENTS.md Network Delays And Usage Costs.
- Browser baseline: Settings Widgets loads, with the existing access control;
  the new service-configuration import is absent on 0.10.30 as expected.
  Production acceptance of 0.10.31 remains pending installation.

### ACR retry and production acceptance completed (2026-09-10, 0.10.31)

- User authorized one retry. ACR job 01A08B4B-65E9-5248-9CF2-FF5DD1433F3E
  succeeded in 354 seconds from exact commit 78a02d78e4ac7a8fa5fc35f25b4fef53e16af208.
  No new GitHub Actions run or release was triggered.
- VPC image digest: sha256:eac514233034f9fc8b46a189531ca26194bfe81f33ddbb28d13f9945ac01a8ab.
  Pull succeeded. Unmodified non-root offline image verification passed:
  13,794 managed files, enforced=true, invalidModules=[], correct version/source,
  native dependencies and installed changelog verified.
- Standard updater returned CORE_UPDATE_APPLIED, exit 0, at 2026-09-10T12:40:03Z.
  Production is running/healthy, zero restarts. Public readiness returns
  BLOGPOSTER_READY, ready, version 0.10.31. Update Agent reconciled through its
  verified check: current, version 0.10.31, available=false, error=null; service active.
- Backup contains all four data/library/modules/widgets archives. Previous
  0.10.30 image and rollback state retained; rollback was not executed.
- Browser reload verified the new Import service configuration control in
  Settings Widgets and Import design JSON in Design Studio library; both
  screens were visually inspected. Existing System / Coming Soon design opens
  with its canvas/widgets. Update Center displays 0.10.31 to 0.10.31, Up to date,
  and the correct installed release changelog. No production import/save/publish
  was performed; full import persistence tests remain the recorded local checks.

### Release 0.10.32 prepared; ACR timeout blocks deployment (2026-09-10)

- New source da03001d adds native tags and translated public discovery. Source CI
  34496407380 failed only the generated-contract freshness test (397 suites passed).
  Ran the canonical backend-event generator; it added tag/tags to the generated
  searchDocuments contract/schema. Five focused suites, 25 tests passed.
- Published 0.10.32 at 1d5b92a9b4bbef58e459694d5fa9e14fbf08d182. Full release
  34501205161 succeeded; duplicate CI 34501205140 cancelled to avoid redundant cost.
- Uploaded the three official update metadata/bundle files to the version-specific
  server directory. Exact tag/source/signer manifest verification returned exit 0.
- Removed only unused Docker builder cache (1.313 GB), increasing free disk from
  1.3 to 2.7 GB. Application data, backups and rollback images were preserved.
- ACR job 517c415b-f16e-4b96-9465-26e496561bc91 failed after 311 seconds.
  Log lines 439-456: prepare-runtime-integrity.js failed with
  RUNTIME_INTEGRITY_DOWNLOAD_TIMEOUT after 108.5 seconds. Compilation completed.
- No apply/pull of 0.10.32 was started. Production remains 0.10.31. Operator scripts
  are prepared; new digest/config and production browser acceptance remain pending.
  No manual retry was triggered: awaiting user decision per AGENTS.md network rule.
- Existing production browser at Designer design 2 already displayed
  WIDGET_SANDBOX_TIMEOUT before this release; no production design was edited.

### 2026-09-10 - 0.10.33 deployment blocked before apply

- Published 0.10.33 at 74ac71cafda181791ebd05801af81078f55e9741; Release 34510254317 and source CI 34509038650 succeeded. Cancelled duplicate release-commit CI to conserve Actions usage.
- ACR source job 8f3841e4-f995-4200-a953-b4e7176f01ac1 checked out that exact commit, then failed with RUNTIME_INTEGRITY_DOWNLOAD_TIMEOUT while fetching integrity artifacts (log lines 421-438).
- Official update metadata copied to the version-specific server directory; manifest attestation verification returned exit 0. No image pull or production apply started.
- Production remains 0.10.31: running, healthy, zero restarts; public /health/ready returned BLOGPOSTER_READY and version 0.10.31.
- Paused before another network retry per AGENTS.md. New heartbeat behavior is not production-verified. Resume with the existing 0.10.33 release after user retry approval; no new release required.
