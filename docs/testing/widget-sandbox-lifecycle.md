# Isolated widget lifecycle verification

Classification: small maintenance; Zero-Node neutral. No backend authority,
package grants, saved content or public user workflow changes. Existing user
guides therefore need no new instructions.

## Regression

The previous shared host compared `Date.now()` with the last worker reply before
sending its next ping. After browser suspension, the first host timer could destroy
a healthy worker before queued worker messages ran. Multiple widgets could fail
together because each used that same elapsed-time check.

The replacement uses a monotonic clock, pauses while hidden/frozen, and starts a
new probe window after visibility/resume or a delayed host event loop. A normally
scheduled foreground worker still fails after ten seconds without a response.
Browser scheduling and resource exhaustion remain outside a hard time guarantee.

## Automated checks

Run:

```sh
npm run build:browser
npx jest --runInBand --runTestsByPath tests/widgetHeartbeat.test.ts tests/widgetSandboxLifecycle.test.ts tests/widgetSandbox.test.ts tests/widgetSandboxStreams.test.js tests/widgetSandboxAssets.test.js tests/runtimeWidgetRenderer.test.ts tests/widgetManagerPublicLoader.test.ts
```

- [x] TypeScript browser compilation, the full asset build and 37 tests across
  seven suites passed. The build retains the existing article-editor size warnings.
- [x] Healthy replies, initial hidden mount, hidden/visible, freeze/resume and
  a single delayed host callback retain the widget.
- [x] Foreground nonresponse and nonresponse after resume still time out.
- [x] Wall-clock jumps do not alter the heartbeat deadline.
- [x] The real mount retains its iframe/view across visibility transitions;
  disconnect and timeout still close ports and dispose services/listeners.
- [x] Existing CSP, source delivery, stream and runtime adapter checks pass.

## Browser and release checks

- [x] Before the fix, the production Help page displayed two timeout errors.
  Browser error/warning logs were empty. Reload restored both widgets and the
  CMS readiness endpoint reported ready. This is consistent with the scheduling
  defect; the original browser-suspension event cannot be recovered from that tab.
- [x] Local native Help mounted the account/language control and composer using
  the changed shared runtime. Typing opened suggestions; ArrowDown and Enter
  opened the intended native article and enabled its follow-up composer.
- [ ] Verify an actual browser/OS suspend-resume cycle after the signed release.
- [ ] Verify the updated shared browser assets and Help search on production.

Release the shared host/browser files together through the ordinary signed engine
release. A widget ZIP alone does not update this code. Existing installations need
no content migration or new service approval. Reload an already failed page after
the release; replacing the installed package is not a recovery requirement.
