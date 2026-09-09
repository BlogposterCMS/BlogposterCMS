# Independent module update acceptance (0.10.8 / 0.10.9)

## Published baseline and compatible acceptance release

Version 0.10.8 was published by successful release run 34333081087, commit
`0d1a785672f968d1f1cc3775a2cd2f164b5652b2`. Its source CI run 34332359372 passed
367 suites (2,004 tests passed, one Windows-only skip), build, parity, CodeQL and
the non-root container check. The shared GitHub runner UID already held 46 tasks;
the dedicated test UID passed both real Linux integration suites.

Version 0.10.9 retains those runtime and module bytes, dependencies and schemas.
Only package release identity and these release notes change, to exercise
officially signed module discovery/activation against the 0.10.8 host. Successful
publication alone does not prove hot update acceptance; record the live results
below after the production checks.

## Completed production acceptance

- Signed 0.10.8 baseline installed with the existing 1.2.3 executor. All four
  persistent volumes were backed up with the writer stopped; archive hashes and
  gzip integrity passed. The previous image and deployment configuration remain.
- Slow registry blob delivery required a byte-preserving delta of the published
  image, retaining already verified base layers. Docker restored the official
  digest through an exact-digest pull. A temporary exact-release transport adapter
  supplied staged manifests/bundles after upstream timeouts; the installed
  executor's signatures, expected-target guard, locks, backup, readiness and
  rollback logic were unchanged. This is not proof of fresh-host online delivery.
- The published image passed all eight negative sandbox checks on the actual
  Linux host with the signed profiles, no network, read-only root, no added
  capabilities and no production volumes. Startup verified 12,353 files with
  zero blocked modules after reconciling the bundled dummy module's old metadata
  against the signed release. Old metadata and complete module backup remain.
- Content, search, workflow, export and translation updated to signed 0.10.9
  through the authenticated browser. Container ID, process ID and process start
  time remained unchanged throughout all five updates; the CMS host stayed 0.10.8.
  Page Management remained usable during the updates and after reload.
- Translation's first package download timed out safely. The existing check
  action retried successfully, followed by a successful module update.
- A separate, deliberate restart then reverified and loaded all five persisted
  0.10.9 generations. The browser showed every module current after reload.
- Failed candidate readiness/old-handler recovery was exercised locally, not by
  deploying deliberately broken signed code to production. No destructive
  production rollback rehearsal was performed.

## Earlier validation evidence

The tag's GitHub validation correctly failed before publication: the runner did
not have bubblewrap installed. Version 0.10.8 supplies the dependency and adds the
real negative sandbox preflight to both existing jobs. Ubuntu's packaged
`bwrap-userns-restrict` AppArmor profile must also be loaded: installing bwrap
alone failed namespace loopback setup with `RTM_NEWADDR: Operation not permitted`.
The profile restricts child capabilities; global user-namespace restrictions
remain enabled. See [Ubuntu's guidance](https://discourse.ubuntu.com/t/understanding-apparmor-user-namespace-restriction/58007).
CI runs Jest in band and executes the two real sandbox suites as a dedicated
unprivileged test user before the build, followed by every remaining suite.
A fresh Jest process under the shared runner UID was insufficient.
The test user receives a tracked-file archive and installed dependencies in its
own temporary workspace, without the runner's private home or Git credentials.
Linux's process limit counts
all threads belonging to the runner UID; both parallel and in-band full-suite
runs failed namespace creation with EAGAIN despite the standalone preflight
passing. Separate local Linux tests also passed as non-root (19 passed, one
Windows-only skip). No sandbox resource limit is increased or test omitted.
No unsigned image or
failed release was deployed, and the 0.10.7 tag remains immutable.
The two affected Linux integration suites were also run locally in the validated
Docker sandbox configuration: 19 tests passed and one Windows-only check skipped.

This release introduces signed independent updates for five core modules and
the isolated community module/widget contract. It also includes the captured
Media Manager and package-picker changes. Shared runtime, UI and schema changes
still use the signed host update. The unfinished host image-download/cancellation
work is excluded; the supported host executor remains 1.2.3.

- Local module browser fixture: translation, content, search, workflow and export
  updated independently; Page Management continued serving 23 pages. Failed
  search readiness preserved the old generation. Selected translation code
  survived an actual process restart. The fixture replaces release signature
  verification and is not a production attestation test.
- Local Docker and separate YiTaiCOS Linux 5.15 container: eight negative
  community isolation checks passed with the supplied AppArmor/seccomp profiles,
  read-only root, no network, all capabilities dropped, 128 PIDs and 256 MiB.
  Test packages could not write code/receipts, read host files, observe host
  processes/secrets, spawn children or reach the parent network listener.
- Production inventory before cutover: only dummyModule, no community widgets.
  CMS remains 0.10.6 until signed release deployment. No production volume was
  mounted in the sandbox test container.
- Frozen snapshot: production build and placeholder parity passed. Full tests
  passed 361 suites initially; five suites affected by checkout line endings and
  an outdated breadcrumb expectation passed on focused reruns after correction
  (366 suites, 1,991 passing tests and 12 skipped in total). The high-severity
  audit gate passed after updating locked Nodemailer to 9.1.1. One moderate
  adm-zip destination-symlink advisory remains; package extraction uses private
  staging directories and rejects archive symlinks. Do not downgrade blindly.
- Local frozen-release browser: real CMS version 0.10.7, five module statuses and
  the new breadcrumb position rendered. Production administrator login verified
  against unchanged 0.10.6 before cutover.
- The earlier pending publication, backup, browser and persistence gates are
  completed in the production acceptance section above.

Keep the previous image, deployment configuration and all four persistent-volume
backups together. See the community migration guide and core module update guide.
