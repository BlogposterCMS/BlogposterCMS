# Choosing a Database Engine

BlogposterCMS can use **PostgreSQL**, **MongoDB** or **SQLite** for storing content. The selected engine is controlled through the `CONTENT_DB_TYPE` environment variable.

## PostgreSQL
- Fully tested with BlogposterCMS.
- Works with the built-in database manager modules.
- Recommended for production use.

## MongoDB
- Support is experimental and not yet thoroughly tested.
- Only choose MongoDB if you are comfortable debugging potential issues.
- **Replica Set required for transactions** – Some core modules use MongoDB
  transactions (e.g. the Pages Manager when marking a start page). Transactions
  only work when the database runs as a replica set or is accessed through a
  `mongos` router. A standalone server will throw `Transaction numbers are only
  allowed on a replica set member or mongos` and the module initialization fails.
  Configure Mongo accordingly or disable transactions if you cannot run a
  replica set. Your `MONGODB_URI` connection string should include the
  `replicaSet=<name>` parameter, e.g. `mongodb://localhost:27017/cms?replicaSet=rs0`.

## SQLite
- Suitable for lightweight setups or testing.
- Uses a single file stored at `SQLITE_STORAGE/SQLITE_MAIN_FILE`.

## How to Select
1. Open `.env` and set `CONTENT_DB_TYPE` to `postgres`, `mongodb` or `sqlite`.
2. Provide the matching connection credentials (`PG_*` variables for Postgres, `MONGODB_URI` for MongoDB, `SQLITE_*` for SQLite).
3. Restart the CMS so the database manager picks up the new settings.

When selecting `postgres` the manager will store its metadata in the main
database under the `databasemanager` schema. This step is skipped when using
MongoDB or SQLite.

Keep your database credentials private and restrict access to the minimal privileges required.
