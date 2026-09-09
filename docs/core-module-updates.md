# Independent core module updates

The existing Updater and Settings Update Center can install a verified core
module generation without restarting the CMS. The same Runtime Manager
`coreUpdates.status/check/install` actions serve the UI and agents; no upload,
source-directory or executable-code API is introduced.

## Supported scope

All 36 entries in `coreModulesForApp`, plus Auth, participate in the generation
lifecycle. The 31 bundled widget packages are a projection of PlainSpace's
existing default-widget catalog, not a second registry. Widget packages select
only their declared browser entry; they cannot contain backend code.

Individual updates still require a compatible host: database engines, schema
helpers, permission contracts, login/font integrations, notification delivery,
shared browser helpers and the update executor retain canonical host ownership.
Changes to these pinned files require a coordinated host release. The optional
community ModuleLoader and its sandbox infrastructure remain host components.
Community modules/widgets retain their existing reviewed package installation.
Do not equate an individual package version with hot replacement of every file
in its source directory.

Cold starts revalidate selected generations through the same bounded verification
worker used for live updates. Hashing and signature checks must stay outside the
main event loop so database replies and timers of already started modules can run.
An invalid signature aborts startup; only a host-compatibility mismatch permits
falling back to the bundled implementation.
Media additionally owns a generation-specific router behind one stable host mount.
Admission pauses only for its matching routes; existing responses and asynchronous
handlers drain before activation. Candidate routes must retain the exact method/path
surface. Designer keeps database placeholders and schema host-owned; preparing its
handlers cannot overwrite the active shared placeholder service.
Designer-owned browser bundles and bundled widget entries follow their selected packages; shared browser/runtime changes still require host compatibility.
The initial installation of this lifecycle requires one ordinary host update.

## Release and trust contract

The existing release workflow prepares `core-module-NAME.json`, attests its exact
bytes with GitHub/Sigstore, and publishes `core-module-NAME.zip`. Its manifest
binds module identity, official repository/tag/source commit, release version,
host fingerprint and exact code paths, lengths and SHA-256 hashes. The package
contains only `manifest.json`, `manifest.bundle.json` and enumerated `code/` files.
Extraction rejects extra entries, aliases, symlinks and oversized archives.

The host-owned `MODULE_POLICY` controls reloadable modules. Package metadata
cannot expand it. Verification uses public trust roots shipped in the already
verified host and the existing official release-workflow identity. Matching file
hashes without valid attestation is insufficient. Community packages keep their
separate mandatory sandbox boundary.

Discovery reuses the host updater's verified candidate release. Download,
verification and hashing run in an owned worker, outside the HTTP event loop.
All host files and dependencies must match the release baseline, except the
explicitly replaceable module files and root package/lockfile version fields.
Schema, shared code and dependency changes therefore require a host update.
Designer-owned browser assets and bundled widget entries are explicitly included
in their signed packages. A compatible replacement retains its event/HTTP surface.

## Installation and recovery

1. Stage and verify without evaluating code. Settings displays the active module
   release version separately from the installed host version.
2. Bind installation to the reviewed module, release version and generation
   hash. Require existing `settings.core.edit` permission. Reject concurrent host
   and module installations through this control path.
3. Reverify the staged generation. Drain existing calls to the selected module;
   new calls receive `CORE_MODULE_UPDATING`. Other modules remain available.
4. Initialize candidate listeners without exposing them, check the event surface
   and run read-only readiness. Failure restores old handler closures without
   rerunning initialization or migrations.
5. Atomically persist the selection and synchronously switch listeners. Retire
   old owned resources after all callbacks and async handlers finish.

Code and `active.json` live under `data/core-module-updates/NAME/`. This is a
code-selection store, not a second module registry or customer-data owner.
`previous` preserves the previous generation identity. The existing data-volume
backup covers this store. Startup verifies selected bytes and attestation again.
A newer full host release supersedes old overrides; modified code or invalid
signatures fail closed.

Drain timeout restores availability. Cleanup failure or an ambiguous persistent
commit requires recovery and blocks additional replacements of that module.
Losing the activation worker is ambiguous: it may have committed before losing
its response. Restart re-reads and verifies the durable selection. There is no
operator-facing manual downgrade/rollback action in this version.

## Module author contract

`initialize` receives the original context plus `lifecycle` and `isModuleUpdate`.
Only reviewed modules exporting `lifecycleVersion: 1` and `healthCheck` qualify.
Listener ownership does not grant authentication; emission still passes through
the original MotherEmitter. Register non-listener resources with
`lifecycle.onCleanup` before adding a module to the host policy.

Use `lifecycle.every(intervalMs, run, options)` for background work: candidate
timers do not run before activation, pending ticks drain before replacement, and
failed readiness resumes the prior timer. Return/await handler promises even if
the callback has already replied or timed out. Admitted async chains may finish
nested module requests while unrelated callers receive `CORE_MODULE_UPDATING`.

Auth revocations, AgentManager queues, access codes and unified-settings schemas
retain their canonical state objects. Updates do not reseed roles, reinitialize
providers, rotate public tokens or register a second notification delivery loop.

## Browser generations

Designer keeps its manifest launch URL and sandbox handshake. Its signed HTML
selects immutable owned assets under `/_module-assets/NAME/HASH/`. New widget
loads select the active widget entry through the canonical widget URL. Open
documents retain their already loaded code until reload; this is not live DOM
replacement. Shared imports redirect to canonical URLs to preserve ES-module
singletons. Private files, manifests and TypeScript sources are not served.

The asset endpoint uses the same public CORS contract as existing browser files;
it does not grant widget backend permissions. Historical generations are verified
before serving, including after restart. Community sandbox restrictions remain.
Widget changelogs live beside the entry as `entryName.CHANGELOG.md`; module
changelogs remain `mother/modules/NAME/CHANGELOG.md`.

The private CommonJS generation cache loads local JavaScript/JSON independently;
imports outside the module resolve against the canonical host. It never clears
Node's global cache. This loader executes trusted core code and is not a sandbox.

## Validation and release acceptance

Focused regressions cover package integrity, fixed trust identity, archive
boundaries, persistent selection, callback draining, failed readiness, worker
interruption, concurrent installation, permissions and real handler replacement
without repeated migrations. Crypto verification is injected in package unit
fixtures; those fixtures are not an official signature proof.

Local browser acceptance uses a complete CMS with a separate database copy and
an explicitly labelled test release transport. All five eligible modules were
updated through the browser. Versions after reload, a failing search candidate
and continued Page Management access were verified. Translation's selected
generation also survived an actual process restart using the real generation
store with fixture signature verification. This does not establish production
download or real release attestation acceptance.

Before production acceptance, publish a signed baseline host release, then test a
host-compatible signed module release through the regular Update Center. Record
container identity, actual module version, unaffected requests, failure recovery
and verified selection after process restart. Local fixtures or a healthy
container do not establish completion of these production checks.

The Update Center refresh icon checks host/core and community sources together. Installed-version notes come from the packaged CHANGELOG.md through the existing core update status response; no browser storage is required.

The CMS module update list omits current, unchecked and completed inventory rows. Available changes, active installations and failed changes with a distinct target version remain visible; an empty section is hidden.

Update rows use native details/summary with versions aligned right. The package
producer reads each module's `CHANGELOG.md`: the exact `## [version]` section takes
precedence over `## [Unreleased]`. It signs the resulting `releaseNotes` and
`breakingChange` fields in that module's manifest. An explicit `### Breaking changes`
heading sets the warning badge; this is author-declared compatibility information,
not automatic custom-code analysis. Notes are limited to 32 KiB UTF-8, displayed as
text, and remain attached to the reviewed generation when installation fails.
Missing notes are explicitly labelled, never replaced with another module's or the
whole product's changelog. Move Unreleased entries into their released version
section when preparing a release to avoid repeating historical changes.

Service and CMS module summaries remain visible without update candidates. Up to date requires a successful check; unavailable and unchecked states never imply current versions.

A successful current host release also reconciles module versions, so unchanged modules report Up to date instead of remaining unchecked.

System contains service and CMS module updates; Installed contains community module updates. The shared refresh checks both tabs regardless of selection.

Installed has stacked Modules and Widgets sections. Bundled widgets use signed individual update packages and their own changelogs. Community widgets retain the reviewed ZIP installation workflow and do not claim automatic update discovery.


The earlier five-module production acceptance used signed baseline 0.10.8 and module packages 0.10.9, including persistence after restart. It does not establish acceptance of the expanded 37-module/31-widget scope; see [current acceptance](testing/module-updates-phase2.md).

GeoIP event handlers participate in independent updates. Its canonical service and
provider adapters retain connections, request limits and configuration for the host
lifetime; changes to those shared bytes require a compatible host baseline.
