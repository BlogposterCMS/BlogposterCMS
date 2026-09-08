# Release 0.10.6 acceptance

Scope: publish the community package installation and revocable access changes
from `f1331464a930a43d8cb021b1e63b13bf10104c7a`. Release metadata only; small
maintenance, Zero-Node neutral. Unfinished host downloader/cancellation work is
not part of this release. No deployment is implied by publishing the tag.

- [x] Source CI run `34276612184`: audit, production build, placeholder parity,
  full tests, native dependency container and CodeQL passed.
- [x] Local focused tests: six suites / 53 tests, plus release metadata test.
- [x] Local authenticated Modules access dialog opens and cancels; reload works.
- [x] Widgets ZIP picker reaches the real backend review for a harmless package;
  cancel reports no access granted and does not install the package. Installed
  access reports the empty catalog. No existing permission was changed.
- [ ] Release tag, manifest, image digest and runtime integrity verification.
- [ ] Existing extension directories preserved before mounting named volumes.
- [ ] Four persistent destinations included in stopped-writer backup/rollback.
- [ ] Host image/version/readiness and public/admin browser acceptance.

Operators upgrading an existing host must follow the extension persistence
section of `docs/server-installation.md`. Do not place empty volumes over an
existing extension tree. Preserve the previous image and persistent backup; do
not claim an image update alone migrated host mounts or backup configuration.
