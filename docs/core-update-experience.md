# In-app Blogposter updates

Status: authorized and implemented locally. Deployment and an actual Docker
container replacement remain separate acceptance gates. Provisioning and the
supported Linux systemd host layout are in `docs/core-updates.md`.

## User flow

1. Check the official stable release periodically in the background. A failed
   check keeps the last confirmed result and reports when it was last checked.
2. Add one administrator notification per new version to the existing
   Notification Manager: “Blogposter 0.9.5 is available”, linking to
   `/admin/settings/updates`. Do not notify ordinary content users or repeatedly
   add the same notification on reload.
3. Extend the existing Update Center with a Blogposter section ahead of the
   existing module updates. Show installed version, available version, release
   notes, last check and a Check for updates action.
4. Offer Install update to an authorized administrator. Explain the short
   interruption before starting; never require GitHub, Docker or shell commands
   in this product flow. Automatic discovery does not imply automatic restarts.
5. Show actual phases: checking, downloading, backing up, installing, restarting,
   verifying and completed. Do not invent percentages when the host cannot
   measure progress. Preserve the job identity across navigation and reconnect
   after restart without submitting another installation.
6. Show the confirmed running version after success. On failure, distinguish
   “Update could not start” from “Previous version restored” and a failed
   recovery requiring operator attention. Include a searchable support code.

## Existing owners

- `settingsPanels.ts` and `updateCenterData.ts` own the Settings surface and data
  adapter. Reuse existing controls and styles; no separate update dashboard.
- Runtime Manager remains the authenticated browser/agent entry point. Typed
  status/check/install actions require appropriate administrator permissions.
- Notification Manager remains the notification owner. Extend its structured
  notification contract with a constrained internal destination if necessary.
- `deploy/blogposter-update` remains the only core-installation implementation:
  fixed official source, verified attestations, digest-pinned image, volume
  backup, single SQLite writer, readiness check and automatic rollback.

## Host connection

Add a local host adapter around the existing updater. It must survive the CMS
container restart. The adapter accepts only status, check and install operations
over a dedicated local channel accessible to the CMS backend, not the browser.
Do not expose arbitrary commands, image URLs, file paths, Compose arguments,
Docker access or manual data-loss rollback through this channel.

The host owns release verification, durable job status and the installation
lock. An installation request identifies the exact previously inspected
version and digest; a changed latest release requires another review instead
of silently installing a different candidate. Repeated requests return the
same running job. Reject invalid, stale and unauthorized requests before any
host action. Keep host configuration and credentials outside CMS writable
data; return bounded structured status without secrets.

This is a new CMS-to-host control boundary. Benefit: one-click updates with
restart-resistant progress while retaining the existing installer. Cost: a
small supervised host component and lifecycle/configuration support. Update
`docs/security.md`, Compose/deployment documentation and release assets with
the implementation; retain the existing module-update permissions and flow.

## Installation and compatibility

Package the adapter in the supported deployment setup so new installations
receive it automatically. Existing hosts need one operator-side setup step;
publishing a CMS image cannot install a missing host service on its own.
For managed installations the operator performs this migration, not the CMS
user. Until connected, report that updates need hosting setup and disable
installation instead of displaying a button that cannot work.

## Required verification

Cover version discovery and duplicate notifications; permission boundaries;
malicious payload/path/command rejection; signature failures; target version
changes; double clicks; durable progress and reconnect; successful install;
backup/readiness failures; rollback and failed rollback. Exercise the real
container replacement on an isolated Docker host and verify the existing
Notification Center and Settings flow in the browser before release.

## Local verification, 2026-09-06

The 12 focused suites passed (79 tests), including the real control HTTP handler,
CMS JSON transport, permission filtering, duplicate install requests, interruption
recovery, shell-level target drift before Docker access and existing Settings /
Runtime Manager regressions. TypeScript no-emit checking, generated backend
contract checking, the Notification Hub webpack entry and installer Bash syntax
checking passed. The browser fixture used the actual compiled panel and dialog
with simulated host state; it showed available, confirmation, restarting and
completed states. It did not replace a container.

The local Docker Desktop Linux engine is unavailable. Real systemd provisioning,
Unix-socket group access from the container, volume backup/replacement/rollback
and production notification-to-settings acceptance remain stable-release gates.
Version 0.10.0-rc.1 publishes this control flow as a prerelease for host acceptance;
GitHub's stable latest-release endpoint continues to serve the previous stable
version. No production host was changed.
