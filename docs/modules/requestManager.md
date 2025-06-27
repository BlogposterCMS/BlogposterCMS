# requestManager

Centralized handler for outbound HTTP requests. Loaded as a core module.

## Startup
- Initialized during boot when core modules load.
- Requires a high-trust JWT.

## Purpose
- Provides a single audited gateway for modules to perform HTTP requests.
- Enforces a whitelist so only approved modules can reach external services.

## Listened Events
- `httpRequest` — perform an HTTP request using Axios.

The payload must include `moduleName`, `moduleType`, `url` and optionally `method`, `data` and `headers`.