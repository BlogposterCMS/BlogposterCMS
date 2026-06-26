# Settings Manager

## Boundaries

Settings Manager owns durable key/value settings as a core module. Public reads
are restricted to an allowlist, and secret or operational settings are never
returned through public runtime contracts. Apps, widgets and community modules
use Runtime Manager or module-specific settings contracts instead of touching
settings storage directly.

Centralized storage of CMS options, similar to WordPress `wp_options`. It
keeps the existing key/value storage contract while exposing safer list,
delete, bulk and public-read events.

## Startup
- Core module that creates its tables on boot.
- Requires a JWT to operate.

## Purpose
- Allows modules to read or change settings using events instead of direct DB access.
- Provides WordPress-style option aliases for backend code that thinks in
  `getOption` / `updateOption` / `deleteOption`.
- Exposes only allowlisted site metadata through public settings events.

## Listened Events
- `getSetting`
- `getOption`
- `getPublicSetting`
- `getPublicSettings`
- `setSetting`
- `updateOption`
- `setSettings`
- `listSettings`
- `listOptions`
- `deleteSetting`
- `deleteOption`
- `getAllSettings`
- `setCmsMode`
- `getCmsMode`

Permission checks ensure only authorised callers can view or modify core
settings. Public settings are limited to non-secret site/runtime keys such as
`SITE_TITLE`, `SITE_DESCRIPTION`, `SITE_URL`, `FAVICON_URL`,
`PERMALINK_STRUCTURE`, `POSTS_PER_PAGE` and comment defaults.
