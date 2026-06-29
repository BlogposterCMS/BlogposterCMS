# Database Manager

## Boundaries

Database Manager is the persistence gateway for core modules. Apps, widgets and
community modules must not call raw SQL, schema lifecycle events or
`performDbOperation` directly. They read or mutate data through module-owned
contracts, Runtime Manager facades or scoped high-level events. Registered
module type wins over payload claims, so a community module cannot become core
by sending `moduleType: "core"`.

The Database Manager acts as the gateway between modules and the persistence layer. It hides direct access behind meltdown events so modules never touch the database driver themselves.

## Startup
- Loaded as a core module during boot.
- Requires a high‑trust JWT token for initialization.
- Registers the CRUD event listeners on `motherEmitter`.

## Purpose
- Creates dedicated databases or schemas for modules.
- Provides generic events used by other modules.
- Can forward requests to remote services when `REMOTE_URL_<module>` is defined.
- Enforces backend boundaries for community modules: direct database writes,
  raw SQL and direct `performDbOperation` calls are core-only. Community
  modules may only read through high-level `dbSelect` or use host-marked
  `moduleHost.storage` calls for module-owned CRUD. Remote database forwarding
  is disabled for them.
- Keeps database lifecycle operations (`createDatabase`, `applySchemaFile`,
  `applySchemaDefinition`) behind core contracts. Community modules cannot run
  schema or database creation during runtime.
- Validates high-level table and column identifiers before constructing local
  SQL. Raw SQL placeholders are the only place where custom SQL operation names
  are accepted, and those are core-only.

## Listened Events
- `createDatabase`
- `performDbOperation`
- `applySchemaFile`
- `applySchemaDefinition`
- `dbInsert`
- `dbSelect`
- `dbUpdate`
- `dbDelete`

The manager also emits `deactivateModule` if a module triggers a fatal error. Every call is validated against the provided JWT before any database operation is executed. Registered module type wins over the payload: a community module cannot set `moduleType: "core"` to gain database access.

`applySchemaFile` and `applySchemaDefinition` allow core modules to create tables or MongoDB collections from a JSON schema at runtime. Tables may specify a `schema` property; when using PostgreSQL the parser creates the schema if needed and prefixes table and index statements with it. Supported column types include `id`, `text`, `string`, `int`, `boolean`, `timestamp`, and `float`.

## Community Module Storage

Community modules should not call `dbInsert`, `dbUpdate`, `dbDelete` or
`performDbOperation` directly. Their supported persistence path is
`moduleHost.storage`, which runs in the Module Loader host boundary and sends
internally marked CRUD requests to the Database Manager.

The storage facade accepts logical table names such as `items`, normalizes them
to physical names such as `community_<module>_items`, injects the community
module identity and rejects raw SQL markers before the Database Manager sees the
request. Direct community mutations without that internal marker remain blocked.
This keeps the contract language-neutral for the future Go host while still
using the existing Database Manager events underneath.

## Lifecycle Boundaries

- `createDatabase`, `applySchemaFile`, and `applySchemaDefinition` require a
  JWT, a safe module name, and an explicit `moduleType: 'core'` payload unless
  the module is already registered as core on `motherEmitter`.
- Community modules cannot run schema or database lifecycle events, even if they
  spoof `moduleType: 'core'`.
- Schema file paths are resolved against the module's own directory under either
  `modules/<moduleName>` or `mother/modules/<moduleName>`. Sibling-prefix paths
  and path traversal are rejected before files are read.

## Database Engines
The manager works with **PostgreSQL**, **MongoDB** or **SQLite** as selected by the `CONTENT_DB_TYPE` variable. PostgreSQL is fully tested and recommended for production use. MongoDB support is experimental. SQLite is intended for lightweight deployments. See [Choosing a Database Engine](../choosing_database_engine.md) for configuration details.

## Placeholder Switch Cases
Operations may reference built‑in placeholders such as `createUserTable` or custom ones registered by modules. A unified `handlePlaceholder` helper now dispatches both built‑in and custom cases before running raw SQL:

```
switch (operation) {
  case 'createUserTable':
    // handled inside postgresPlaceholders.js or mongoPlaceholders.js
    break;
  default:
    // falls back to user provided SQL or driver methods
}
```

Core services can register custom placeholders using the `registerCustomPlaceholder` helper.

Community modules run in external processes, so custom placeholders cannot call
their exports with the host `dbClient`. If a process-isolated module owns a
database operation, expose it as a module-owned event or add an audited core
database contract instead. `handlePlaceholder` rejects process-owned custom
placeholders with `E_PLACEHOLDER_PROCESS_MODULE_UNSUPPORTED`.

For development safety, a parity check script ensures every placeholder case in
MongoDB and SQLite matches the Postgres implementation. Run it with

```bash
npm run placeholder-parity
```
before committing database changes.

## Module Databases
Modules listed in the `HAS_OWN_DB` environment variable receive a dedicated database. Others share the main database through isolated schemas. Credentials are generated from `MODULE_DB_SALT` and never exposed.

Modules normally access **only their own** database or schema. Accessing another module's data requires a JWT that explicitly names that module and grants permission, which should be avoided for security reasons.

Always keep database credentials private and grant only the minimal privileges needed.
