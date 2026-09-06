# Notification System

The `notificationManager` core module provides a simple pluggable way to deliver
system notifications. Integrations can write to log files, send emails or post
to chat services such as Slack.

## Registry and Integrations

Integrations live in `mother/modules/notificationManager/integrations`. Each
integration exports an object with an `integrationName` and an `initialize`
method. The signed `mother/modules/notificationManager/integrationsRegistry.json`
is a read-only release default. On first start the manager copies it to
`data/notificationManager/integrationsRegistry.json`, then loads and updates only
that persistent registry. Existing activation and integration configuration is
preserved across core updates; new release integrations are added without
replacing existing entries.

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
Replace these placeholder credentials in the persistent registry through the
administration workflow. Never commit `data/notificationManager`; it can contain
integration credentials.

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
`runtimeManager.cmsAdminApiRequest` facade (`notifications.recent`). This
provides quick visibility into errors or status messages without checking
server logs while keeping the raw notification event behind the core contract.

The header logo is a labelled keyboard-accessible button. The compact panel uses
the shared Studio surfaces, border, shadow and theme tokens in light and dark
mode. Recent events use one list with source, timestamp and a small severity
indicator. Loading, empty and failed reads have explicit states; Refresh retries
without discarding previously loaded history. Escape and Close return focus to
the trigger. Update Center destinations and the once-per-session update notice
retain their existing behavior; there is no new unread or notification store.

## Floating feedback

`ui/shared/feedback/toast.ts` owns the existing `bpToast` API. The shared browser
region shows at most **three** cards, newest first; a new card immediately removes
the oldest when full. Ordinary feedback dismisses after **3,000 ms**, followed by
a short exit transition. Pointer hover and keyboard focus pause the remaining
time, including when both overlap. Explicit durations remain supported;
`duration: 0` is reserved for caller-managed pending operations.

Toasts use Blogposter's shared surfaces and controls. They are transient feedback
and do not create server notifications, history, unread counts or cross-tab state.
Dismissal, overflow and `bpToast.clear()` clean up their timers. Persistent events
continue to come from the Notification Hub's existing facade.

Local verification (2026-09-06): production build and scoped lint passed; the UI
suite passed 122 suites / 640 tests. The UI gallery confirmed the three-card cap,
automatic removal and shared light/dark surfaces. Focused `toast.test.ts` and
`notificationHub.test.ts` cover paused timers, cleanup, load recovery, keyboard
closure, safe text and the existing once-per-session Update Center notice.

For a deeper look at the implementation, see the [Notification Manager](modules/notificationManager.md) documentation.
