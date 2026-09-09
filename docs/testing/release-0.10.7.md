# Release 0.10.7 acceptance

The tag's GitHub validation correctly failed before publication: the runner did
not have bubblewrap installed. Version 0.10.8 supplies the dependency and adds the
real negative sandbox preflight to both existing jobs. Ubuntu's packaged
`bwrap-userns-restrict` AppArmor profile must also be loaded: installing bwrap
alone failed namespace loopback setup with `RTM_NEWADDR: Operation not permitted`.
The profile restricts child capabilities; global user-namespace restrictions
remain enabled. See [Ubuntu's guidance](https://discourse.ubuntu.com/t/understanding-apparmor-user-namespace-restriction/58007).
CI runs Jest in band because Linux's process limit counts all threads belonging
to the runner UID. Parallel Jest workers exhausted the unchanged 64-task limit
at namespace creation, although the standalone negative preflight passed.
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
- Pending: official release signatures/image, stopped-writer backup, production
  cutover and authenticated browser acceptance.
- Pending: subsequent host-compatible signed module update on production with
  unchanged CMS container/process identity and verified persisted generation.

Keep the previous image, deployment configuration and all four persistent-volume
backups together. See the community migration guide and core module update guide.
