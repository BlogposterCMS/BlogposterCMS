# Notification Manager

## Boundaries

Notification Manager bridges internal system notifications to configured
integrations. Apps, widgets and community modules do not instantiate
integrations or read notification history directly. Recent notification reads
go through Runtime Manager or the scoped `getRecentNotifications` event with
`moduleName: "notificationManager"`, `moduleType: "core"` and
`notifications.read` when a user principal is present.

Dispatches system notifications to configured integrations such as email, Slack or
custom web hooks.

## Startup
- Core module loaded during boot.
- Loads integrations defined in its configuration.

## Purpose
- Listens to the internal `notificationEmitter` and forwards messages to active integrations.

## Listened Events
- The manager primarily listens on `notificationEmitter` for `notify` events.
- It exposes the core event `getRecentNotifications`; browser/admin callers
  reach it through `runtimeManager.cmsAdminApiRequest` resource
  `notifications`, action `recent`.
- The runtime facade requires the `notifications.read` permission for recent
  notification reads.
- Direct `getRecentNotifications` event payloads must be scoped as
  `moduleName: "notificationManager"` and `moduleType: "core"` with a valid
  JWT. If a decoded user JWT is present, it must include
  `notifications.read`.

Each integration can perform its own security checks before sending data
externally. If an integration exposes a `verify` function, the manager calls it
before `initialize` and skips the integration when verification fails. A
`fields` array lets the admin UI know which settings to collect.

### Built-in integrations

- **FileLog** – appends notifications to a local log file and ensures the
  directory exists before writing.
- **Slack** – posts messages to a Slack channel via incoming webhook using only
  Node's core `https` module. Only `https://hooks.slack.com/` URLs are allowed,
  requests time out after five seconds and a channel override works only when
  the webhook permits it.

See the high level [Notification System](../notification_system.md) guide for configuration examples.
