# Module Loader

Loads optional community modules from the top-level `modules/` directory. Each module is sandboxed during a health check to prevent crashes or unsafe behaviour. The sandbox uses Node's `vm` module and only exposes `path` and `fs` as allowed dependencies.

## Startup
- Core module executed after the initial core modules are ready.
- Requires a valid JWT to register modules in the database registry.

## Purpose
- Maintains a registry of installed modules.
- Loads modules and retries failed ones automatically.
- Serves front-end assets for GrapesJS modules when present.

## Listened Events
- `getModuleRegistry`
- `listActiveGrapesModules`
- `activateModuleInRegistry`

Every module folder must export an `initialize` function and include `moduleInfo.json` with metadata.

## Module Uploads

Administrators can install additional modules through the admin interface. The upload button in the Modules page header accepts a single ZIP archive. For security reasons the archive is extracted in a temporary directory and validated before activation.

The ZIP must contain a folder with at least these files:

1. **index.js** – entry point exporting an `initialize` function.
2. **moduleInfo.json** – metadata describing the module. It must contain `moduleName`, `version`, `developer` and `description` so the system can track updates and authorship.

Optional files such as `apiDefinition.json` or a `frontend/` folder may be included for modules that extend the builder. Any other resources will be placed in the module's directory.

Uploaded modules run in a sandbox and lack network access unless explicitly allowed. Always review third‑party code before installing it.
