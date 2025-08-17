# Notification System

The `notificationManager` core module provides a simple pluggable way to deliver
system notifications. Integrations can write to log files, send emails or post
to chat services such as Slack.

## Registry and Integrations

Integrations live in `mother/modules/notificationManager/integrations`. Each
integration exports an object with an `integrationName` and an `initialize`
method. When the CMS starts, the manager loads the `integrationsRegistry.json`
file to determine which integrations are active and passes their stored config to
`initialize`.

Integrations can also expose a `fields` array describing their configuration
requirements. The registry mirrors this metadata so the admin UI can present
tailored forms instead of generic key/value inputs. If an integration exposes a
`verify` function, the manager runs it on startup and skips initialization when
verification fails.

Example registry entry:
```json
{
  "SMTP": {
    "active": false,
    "config": {
      "host": "smtp.myserver.com",
      "port": 587,
      "user": "myuser",
      "pass": "mypassword"
    },
    "fields": [
      { "name": "host", "label": "SMTP Host", "required": true }
    ]
  }
}
```
Replace these placeholder credentials with real values in a deployment-specific
registry file that is **not** committed to version control.

## Usage

Other modules emit `notify` events via `notificationEmitter` with a payload
containing a `notificationType`, `priority` and free-form `message`. All active
integrations receive the payload. If an integration throws an error during
notification delivery, it is logged but the CMS continues running.

This system ensures important events (such as module meltdowns) can alert
administrators via the channels they prefer. Built-in integrations include a
file logger and a Slack webhook sender that relies only on Node's core `https`
module. The Slack integration only accepts `https://hooks.slack.com/` URLs,
times out after five seconds and a channel override works only when the webhook
is configured to allow it.

## Notification Hub

Version 0.5.0 uses the Blogposter logo in the admin header. Clicking the logo opens the
Notification Hub, which lists recent events fetched via the
`getRecentNotifications` meltdown event. This provides quick visibility into
errors or status messages without checking server logs.

For a deeper look at the implementation, see the [Notification Manager](modules/notificationManager.md) documentation.
