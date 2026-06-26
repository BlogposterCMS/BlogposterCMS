# requestManager

## Boundaries

Request Manager is the only audited outbound HTTP gateway for core modules that
are explicitly allowed to use it. Community modules, apps and widgets do not
emit `httpRequest` directly. A module needing external data exposes its own
safe core contract and keeps destination host policy in configuration.

Centralized handler for outbound HTTP requests. Loaded as a core module.

## Startup
- Initialized during boot when core modules load.
- Requires a high-trust JWT.

## Purpose
- Provides a single audited gateway for modules to perform HTTP requests.
- Enforces a whitelist so only approved modules can reach external services.
- Accepts only core module callers. Community modules must use a documented
  core module contract instead of emitting `httpRequest` directly.
- Optionally restricts destination hosts with
  `REQUEST_MANAGER_ALLOWED_HOSTS=host1,host2`.

## Listened Events
- `httpRequest` — perform an HTTP request using Axios.

The payload must include `jwt`, `moduleName`, `moduleType: "core"`, `url` and
optionally `method`, `data` and `headers`. The registered module type wins over
the payload, so a community module cannot set `moduleType: "core"` to gain
outbound network access.
