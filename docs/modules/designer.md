# designer

The `designer` module persists layouts for the standalone Designer app using the event bus.
It demonstrates how community modules provision their own schema and run CRUD operations
without touching database drivers directly. The Designer UI now runs inside an iframe
(`admin/app/designer`) so its styles and scripts remain isolated from the dashboard.

## Startup
- Loaded from `modules/designer` when present.
- Exports `initialize({ motherEmitter, jwt, nonce })`.
- On start it:
  - emits `createDatabase` to provision its own database or schema.
  - applies `schemaDefinition.json` through `applySchemaDefinition` to create required tables across supported databases.

## Purpose
- Stores and updates layout definitions for builder clients.

## Listened Events
- `designer.saveLayout`

## Security Notes
- Sanitises layout names to avoid injection or log issues.
- Every database call includes the loader issued `jwt` and module information.
- Uses high level `dbSelect`, `dbInsert` and `dbUpdate` events to avoid raw SQL.
