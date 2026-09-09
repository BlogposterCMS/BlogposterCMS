# Independent core module updates

The existing Updater and Settings Update Center can install a verified core
module generation without restarting the CMS. The same Runtime Manager
`coreUpdates.status/check/install` actions serve the UI and agents; no upload,
source-directory or executable-code API is introduced.

## Supported scope

`translationManager`, `contentEngine`, `searchManager`, `workflowManager` and
`exportManager` own replaceable event handlers. Their schema/bootstrap helpers
remain in the host compatibility fingerprint. Replacement does not create
databases, migrate schemas or reseed default content types.

Other modules remain coordinated host updates. Authentication, database and
transport authorities, community isolation, browser bundles and modules with
unowned HTTP routes, timers or shared service instances must not be marked
reloadable merely because their source resides in a module directory.
Media, Designer and the shared runtime are not yet independently replaceable.
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
Schema, shared code, dependencies and frontend changes therefore require a host
update. A host-compatible replacement retains its registered event surface.

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
