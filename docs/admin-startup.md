# Admin startup

The Admin shell and embedded applications use the existing shared Meltdown
client. Normal commands, including `cmsAdminApiRequest` and `dispatchAppEvent`,
remain ordered: the next request starts after the previous response has been
parsed or failed. The default no longer adds a 100 ms idle timer after each
response. Callers can still explicitly configure `throttleDelay` when needed.
The public facade retains its existing maximum of four concurrent reads.
Tokens, CSRF, permissions, endpoints and request timeout behavior are unchanged.

Fixed Admin pages compose their own widgets from page metadata; the Admin grid
does not use global layout slots for these pages. `pageRenderer` therefore skips
that unused read on both initial rendering and content navigation. Editable
dashboards and the public runtime still load their inherited global layout.

## Local validation, 2026-09-07

- A controlled run of twelve queued requests, each with a simulated 5 ms
  response delay, took approximately 1,411 ms before and 215 ms after the change.
  Actual timers include Windows scheduling overhead. Maximum concurrent command
  requests stayed at one; this isolates queue overhead, not server performance.
- A local Analytics browser observation including the chart/table completed in
  about 3.3 seconds before and 0.9 seconds after. This includes automation
  overhead and uses a warm asset cache; it is not a cold-cache benchmark or a
  production guarantee. Temporary test tabs were closed after connection
  contention interrupted an intermediate run; that run was excluded.
- Home navigation rendered both workspace and operations widgets successfully.
- The five focused suites (`meltdownClient`, `pageRendererStartup`,
  `runtimeAdminGrid`, `publicMeltdownClient`, `appFrameLoaderData`) passed all
  27 tests. TypeScript browser compilation and the production webpack build
  passed. Changes are local, not deployed.

The tests cover ordered delivery through failures without advancing the clock,
explicit pacing, the public concurrency limit, transport credentials and
preserved inherited layouts. This correction does not parallelize Admin writes
or introduce a second transport/cache. Remaining startup cost includes the
required sequential reads, module loading, shell hydration and widget work.
Analytics still aggregates retained event rows and loads its local chart library.
Measure these separately before claiming every page has the same load time.

Designer save conflicts use DESIGNER_VERSION_CONFLICT. The database bridge rejects that save without deactivating designerManager; all other failure handling and database permission checks remain unchanged. If an older runtime already deactivated the module, restart it after applying the fix. Search for the first deactivation reason before investigating subsequent missing-module errors.
