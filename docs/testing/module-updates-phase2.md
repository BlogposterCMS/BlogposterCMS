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
