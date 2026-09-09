# Individual module updates: acceptance

Status: implemented locally; expanded production acceptance remains pending.

## Implemented

- All 36 CMS modules and 31 bundled widget entries use the existing signed package,
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
