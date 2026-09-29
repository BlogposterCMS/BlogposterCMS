# BlogposterCMS 0.10.41 verification

- Scope: keep Analytics registered after transient SQLite `BUSY`/`LOCKED` and database-operation timeout errors. Fatal storage failures still deactivate the module.
- Source prerequisites: no migration or dependency change. The production SQLite database and Analytics bounded retry queue remain the single authorities.
- [x] Focused DatabaseManager/Designer regression suites passed locally.
- [x] After one bounded CMS container restart, the authenticated Analytics overview loaded its summary again. This restores the current session but does not prove the code fix is deployed.
- [ ] Complete the required signed `v0.10.41` release, ACR promotion and exact source/digest verification.
- [ ] Deploy the verified image through the existing pull-only updater, then check health, Analytics summary after reload and bounded logs.
- Rollback: restore the retained 0.10.40 image and unchanged data volume. Restarting the old image may temporarily restore the listener but leaves the transient-error trigger unfixed.
