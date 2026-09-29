# BlogposterCMS 0.10.42 verification

- Scope: release the Analytics storage recovery from 0.10.41 with the locked `undici` 6.29.0 security update.
- [x] Focused DatabaseManager/Designer regression suites passed before the lockfile-only update; the high-severity vulnerability audit passed after it. The fresh worktree has no installed Jest dependencies, so the suites await CI on this exact lockfile.
- [ ] Signed release and required ACR promotion complete for the exact source commit.
- [ ] Existing pull-only updater deploys the verified image; health, authenticated Analytics reload and bounded logs pass.
- Rollback: retained 0.10.40 image and unchanged data volume. The old image retains the transient-error Analytics failure.
