# appLoader

Builds the app registry by scanning `apps/*/app.json` manifests during startup. The registry feeds the builder and admin UI so available apps and their entry points are known ahead of time.

## Startup
- Core module executed during boot before the server begins listening.
- Reads each `app.json` manifest under `apps/` and records metadata for the app.
- Skips malformed or inaccessible manifests and logs warnings.

## Purpose
- Maintains an in-memory registry of available apps.
- Exposes a meltdown event `getAppRegistry` that returns the registry to authorised callers.
- Supplies Webpack with entry point information so app bundles can be resolved automatically.

## Security Notes
- Manifest paths are resolved and normalised to block directory traversal.
- Only whitelisted fields are stored; unexpected properties are ignored.
- Registry consumers should still validate user input before loading assets.

The module keeps app discovery isolated so untrusted manifests cannot crash the server or expose sensitive paths.
