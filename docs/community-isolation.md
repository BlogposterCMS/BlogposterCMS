# Community runtime and pre-alpha migration

There is one supported community execution contract, with no legacy fallback.
Core modules and bundled `/ui/widgets/plainspace/` widgets remain trusted product
code. A community manifest cannot claim that trust.

## Modules are backend-only

The existing `moduleHost` event and scoped storage APIs remain the only module
communication channel. On Linux, the runner uses bubblewrap with private user,
PID, network, IPC, UTS and cgroup namespaces. Only its own read-only package,
the trusted runner, Node and runtime libraries are visible. The host database,
other packages, credentials, installer and approval receipts are not mounted.
No package can modify its installed code. Module static frontends and
`registerStaticAssets` fail with `E_MODULE_UI_DENIED`.
No procfs is mounted in the runner. Further namespace creation is denied by the
mandatory seccomp filter, including namespace flags on thread-shaped clone calls.
This preserves Docker's read-only/masked proc mounts without writing host sysctls.

The seccomp filter denies new sockets, child processes, namespace changes and
process inspection syscalls; Node threads remain available. Supported syscall
ABIs are x64 and arm64. Node runs without JIT and with a 128 MiB old-space limit;
Linux additionally limits data memory to 512 MiB, file descriptors to 64, new
process/thread count to the UID's limit of 64, file size to 16 MiB and cumulative
CPU time to one hour per runner. `/tmp` is private and limited to 16 MiB. A busy
module may therefore need a controlled restart. This is not a throughput quota.
IPC frames are limited to 1 MiB, incoming messages to 200/second, listeners to
100 and logs to 1 MiB per runner. Kernel/runtime vulnerabilities remain relevant;
keep the host patched and apply outer service/container resource limits too.

No provider environment variables enter the runner, even when apiDefinition.json
declares a service. Cross-module requests need declared, currently approved
registry grants. Old in-memory grants and one-time prompts cannot substitute for
review. Use existing named core domain actions; arbitrary `httpRequest` remains
ungrantable. Core integrations use RequestManager with explicit
`REQUEST_MANAGER_ALLOWED_HOSTS`, HTTPS, pinned public IPv4 DNS, no proxies or
redirects, and bounded request/response sizes and timeouts. There is deliberately
no package-configured URL/header/credential escape hatch. A new provider needs a
reviewed core operation behind the existing domain and permission contracts.

## Widgets are UI-only

Community source is served as non-executable text (`nosniff`, `no-store`). It is
never imported into the CMS document. A trusted sandbox iframe creates an
opaque-origin classic worker: the worker cannot access the DOM, navigate,
access CMS-origin browser storage or contact the network. Its inherited CSP
allows only local blob scripts; the iframe cannot navigate the top, create
popups, submit forms or embed additional documents. Code cannot grant itself
services. Browser memory exhaustion is not completely prevented by this model;
oversized/fast messages and nonresponsive workers are terminated, but the browser
still owns worker resource scheduling.

Set `uiContractVersion: 2` in widgetInfo.json. Bundle a classic script with a
top-level `render(ui, context)` function in widget.js; no ES imports/exports,
package manager or installation scripts. Inspection parses but never executes it.

```js
function render(ui, context) {
  ui.render({ tag: 'button', text: 'Load results', action: 'load' });
  ui.on('load', async () => {
    const result = await context.services.request('search', { query: { q: 'example' } });
    ui.render({ tag: 'p', text: String(result.title || '') });
  });
}
```

The host renders a bounded declarative view tree using the shared widget UI renderer:
500 nodes, depth 20, 16 KiB per text field and 128 KiB per message. Stable `key`
values preserve controls, cursor position and Chinese IME composition during updates.
Inert semantic markup, native form controls, a plaintext composer, sanitized
article content, popovers, tooltips, dialogs/drawers, status output and existing
UI-kit components are supported. No arbitrary DOM handle, executable HTML or
stylesheet crosses the boundary. Local style values pass the existing UI-kit
validator; URL-bearing CSS is rejected. Automatic images are restricted to
same-origin `/media/` and `/assets/` paths without queries. Links are validated
and only navigate following a user action. Public styles live in their own root.

`context` contains widgetId, preview, locale, origin, pathname, languages and a
bounded instance mode, plus the service facade. Requests, drafts and preferences
remain asynchronous. `services.subscribe(name, event, receive, onError)` returns
an asynchronous subscription handle for an already approved stream operation;
closing, expiration, policy refresh and revocation retain existing service limits.
Stream events may arrive before subscription acknowledgment and are registered
before the request. Errors expose only safe codes and selected HTTP status values.
See [Designer interactions](designer-interactions.md) for data bindings and examples.

No tokens or complete page/Designer objects are copied into a worker. Public
policy contains the installed script hash; every service refresh compares it
with the script loaded by that instance. An old tab cannot inherit a replacement
package's new grants. Operator configuration without package consent grants
nothing; inspection shows configuration availability without granting access.

## Existing installations: keep data, replace incompatible code

1. Back up the **complete** data, library, modules and widgets volumes and the
   matching release configuration. Keep all four together for rollback.
2. Run `node tools/check-community-migration.js`. This only inventories package
   metadata and syntax. It neither executes code nor changes files, database rows,
   grants, settings, layouts, content, draft keys or installation IDs.
3. Validate Linux with unprivileged user namespaces, bubblewrap supporting
   sized tmpfs and util-linux/prlimit. Run
   `node tools/verify-community-sandbox.js` on the **actual deployment host**.
   The test makes a temporary fixture and local listener and checks code writes,
   host file/process access, receipt writes, secrets, subprocesses and network.
4. Adapt module code to moduleHost and existing core actions. Review its grants
   in Modules. Split former frontend code into a widget package. The bundled
   dummyModule needs no data migration.
5. Migrate widget source to the v2 UI contract while keeping its widget ID,
   configured service names and existing data keys. Do not just add the version
   field to a DOM-based renderer. Upload the adapted ZIP in Widgets: the review
   explicitly offers replacement and additionally requires widgets.update. The
   installer retains verified old package bytes, receipt and policy under
   data/extension-backups/widgets. It preserves the registry row and widget ID,
   and restores files/receipt/grants on a handled installation failure. Never
   delete that backup before acceptance. A process/host crash during the swap
   can require operator restoration from this backup; there is no cross-volume
   database/filesystem transaction. Signed release-owned widgets require a
   signed release update instead of ZIP replacement.
   Release-owned files in persistent volumes are not replaced by an image pull.
   When their signed bytes change, back up and verify the old release identity,
   copy only the reviewed replacement from the verified image while the CMS is
   stopped, then verify startup. Never overwrite unrelated installed packages.
6. Deploy matching server/browser artifacts, reload open CMS/Designer sessions,
   and verify layouts, stored drafts, permissions and revocation. Incompatible
   widgets show `WIDGET_SANDBOX_MIGRATION_REQUIRED`; module errors appear through
   the existing registry status. Nothing automatically resets user data.

The runtime image includes bubblewrap/prlimit. Docker's outer seccomp/AppArmor
policy may deny the required namespaces. The existing Compose profile is **not
proof** that nested isolation is supported: validate it before cutover. Do not
use privileged containers, an unconfined policy, a Docker socket in the CMS or an
unsandboxed fallback as a shortcut. A supported direct Linux service can be used
where the container host has not yet provided a reviewed namespace policy.
Native Windows/macOS community execution is unavailable; use a validated Linux
environment. Core CMS startup and data remain independent of that availability.

### Docker namespace profiles

`deploy/blogposter-community.seccomp.json` derives from Moby's default profile at
commit `61eaf32614c7c71b60bd8927d3e6a4ffc8ff1f31`. The only added syscall rules
allow bubblewrap's exact all-namespace clone flags, `unshare(CLONE_NEWUSER)`,
mount, umount2 and pivot_root. No capability is added to the outer container.
The AppArmor profile retains the default proc/sys protections and permits only
tmpfs/devpts plus the bind/remount/propagation operations used by bubblewrap.
Both files derive from Moby under the adjacent Apache-2.0 license. Review them
when changing the Docker/kernel/bubblewrap baseline. Namespace creation expands
the kernel surface reachable by trusted CMS code; it is denied to community
code by the additional runner filter.

On an AppArmor Linux host, install the verified release profiles root-owned in
`/opt/blogposter/`, load `blogposter-community.apparmor` with `apparmor_parser -r`,
and persist that profile under `/etc/apparmor.d/` for reboot. Append the supplied
`blogposter-community.compose.yml` to the existing Compose file list, including
the host updater's configured list. Keep `cap_drop: ALL`, no-new-privileges and
Docker's default masked/read-only paths. Do not replace the global docker-default
profile. Back up the existing configuration and retain the previous image.
Before cutover, execute the negative test in a disposable container on that host
with these profiles, no network and no production volumes. Missing AppArmor or
failed negative checks are deployment blockers, not reasons to disable isolation.

On 2026-09-09, all eight negative checks passed locally on Docker Desktop and in
a disposable container on YiTaiCOS's Linux 5.15 host with the reviewed profiles,
all capabilities dropped, read-only root, no network, 128 PIDs and 256 MiB memory.
The running CMS was not changed by this preflight. This is sandbox acceptance,
not a signed release, package migration or production CMS cutover.

Migration is intentionally not an automatic source-to-source rewrite. Local or
third-party widgets with direct DOM or unrestricted network dependencies stay blocked
until their author supplies a compatible package. Operator backups and existing
package files remain the recovery source; a code deployment is not a completed
production migration.

The v2 presentation extension and approved stream/navigation path are documented in
[Designer interactions](designer-interactions.md). Existing packages still require
an author-supplied worker migration and review of their exact bytes/grants.
