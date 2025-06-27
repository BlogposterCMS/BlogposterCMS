# Database Manager

The Database Manager acts as the gateway between modules and the persistence layer. It hides direct access behind meltdown events so modules never touch the database driver themselves.

## Startup
- Loaded as a core module during boot.
- Requires a high‑trust JWT token for initialization.
- Registers the CRUD event listeners on `motherEmitter`.

## Purpose
- Creates dedicated databases or schemas for modules.
- Provides generic events used by other modules.
- Can forward requests to remote services when `REMOTE_URL_<module>` is defined.

## Listened Events
- `createDatabase`
- `performDbOperation`
- `applySchemaFile`
- `applySchemaDefinition`
- `dbInsert`
- `dbSelect`
- `dbUpdate`
- `dbDelete`

The manager also emits `deactivateModule` if a module triggers a fatal error. Every call is validated against the provided JWT before any database operation is executed.

`applySchemaFile` and `applySchemaDefinition` allow modules to create tables or MongoDB collections from a JSON schema at runtime.

## Database Engines
The manager works with **PostgreSQL**, **MongoDB** or **SQLite** as selected by the `CONTENT_DB_TYPE` variable. PostgreSQL is fully tested and recommended for production use. MongoDB support is experimental. SQLite is intended for lightweight deployments. See [Choosing a Database Engine](../choosing_database_engine.md) for configuration details.

## Placeholder Switch Cases
Operations may reference built‑in placeholders such as `createUserTable` or custom ones registered by modules. The manager checks these placeholders before running raw SQL:

```
switch (operation) {
  case 'createUserTable':
    // handled inside postgresPlaceholders.js or mongoPlaceholders.js
    break;
  default:
    // falls back to user provided SQL or driver methods
}
```

Modules can register custom placeholders using the `registerCustomPlaceholder` helper.

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
