# Server Manager

## Boundaries

Server Manager is a core-only operations module. Apps, widgets and community
modules must not add, update or delete server records directly. Admin surfaces
use Runtime Manager with permission checks; direct events remain reserved for
trusted core code with scoped `serverManager` identity.

Stores and retrieves server location information used for distributed setups.

## Startup
- Core module with JWT required.

## Purpose
- Allows adding, updating and deleting server locations.

## Listened Events
- `addServerLocation`
- `getServerLocation`
- `listServerLocations`
- `deleteServerLocation`
- `updateServerLocation`

All event payloads must be scoped as `moduleName: "serverManager"` and
`moduleType: "core"` with a valid JWT. Calls from other modules, widgets or
apps must go through the runtime/admin facade instead of emitting these events
directly. Only callers with the appropriate permission can modify server
records.
