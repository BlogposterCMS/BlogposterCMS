# Updater

## Boundaries

This is a trusted core module. Widgets and apps use Runtime Manager's
permission-checked actions; they cannot access the host socket directly.

`mother/modules/updater` is a mandatory core module loaded by the ordinary core
bootstrap. ModuleLoader handles optional module packages; it does not own core
release orchestration. Community packages cannot replace the Updater module.

The existing Runtime Manager `coreUpdates.status/check/install` actions target
`updater` and require `settings.core.edit`. Settings and Notification Center keep
their existing UI. Notifications derive from the Updater's current verified
candidate and remain filtered by the caller's permission.

The module requests discovery ten seconds after startup and every six hours.
Unavailable hosting does not disable the CMS. Active or unresolved recovery jobs
are not restarted by discovery. The root-owned host executor retains durable
job identity, verifies manifests/images, backs up volumes, replaces the container
and rolls back if readiness fails. It has no independent discovery schedule.
Only fixed status/check/install requests cross the Unix socket; no Docker socket,
shell command, arbitrary path or runtime secret is exposed to the CMS.

Use the [combined server installation](../server-installation.md) for new hosts
and existing installations. The same command connects the executor and verifies
that the CMS container can access it. Subsequent updates are operated in Settings.
