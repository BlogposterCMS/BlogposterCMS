# Auth Module

## Boundaries

Auth is a core-only module. Apps, widgets and community modules do not mint or
validate tokens directly; they use the runtime or app bridge contracts that
forward to Auth with a scoped core payload. Login strategy registration is
reserved for trusted strategy code that presents `AUTH_MODULE_INTERNAL_SECRET`.
Token issuance and lifecycle events require `moduleName: "auth"`,
`moduleType: "core"` and a valid internal contract.

The Auth Module validates credentials and issues JWTs for the rest of the system. It **must** run as a core module so it can manage login strategies and sign tokens securely.

## Startup
- Loaded during server boot by the core loader.
- Requires `JWT_SECRET` and `AUTH_MODULE_INTERNAL_SECRET` in the environment.
- Automatically loads any strategy files under `mother/modules/auth/strategies`.

## Purpose
- Provides login strategies (local and OAuth) that modules or the public API can use.
- Issues and validates tokens for modules and users.
- Stores refresh tokens in the database and supports token revocation.
- Offers helpers to check or extend token lifetimes.

## Listened Events
- `listActiveLoginStrategies`
- `listLoginStrategies`
- `setLoginStrategyEnabled`
- `registerLoginStrategy`
- `loginWithStrategy`
- `issueModuleToken`
- `issueUserToken`
- `issuePublicToken`
- `ensurePublicToken`
- `validateToken`
- `revokeToken`
- `revokeAllTokensForUser`
- `issueRefreshToken`
- `refreshAccessToken`
- `revokeRefreshToken`
- `setModuleTokenExpiry`
- `setUserTokenExpiry`

All payloads must include a valid JWT and the correct `moduleName`/`moduleType`. Invalid calls are rejected. Login strategy administration is permission-gated:

- `listActiveLoginStrategies` is read-only discovery for the login screen;
  browser callers use `runtimeManager.cmsPublicRuntimeRequest` resource `auth`,
  action `activeLoginStrategies` rather than calling this event directly.
- `listLoginStrategies` requires `auth.strategies.view` or `auth.strategies.manage`;
  browser/admin callers should reach it through
  `runtimeManager.cmsAdminApiRequest` resource `auth`, action
  `loginStrategies`.
- `setLoginStrategyEnabled` requires `auth.strategies.manage`.
- `registerLoginStrategy` is reserved for boot-time strategy registration with `AUTH_MODULE_INTERNAL_SECRET`.
- `loginWithStrategy` accepts either scoped Auth core payloads or verified
  public tokens with `purpose: "login"`. The HTTP login route calls it
  server-side; browsers should not call it through `/api/meltdown`. `skipJWT`
  alone is not a login bypass.
- `issueModuleToken` and `issueUserToken` are internal Auth contracts only:
  callers must use `moduleName: "auth"`, `moduleType: "core"`,
  `skipJWT: true`, and `AUTH_MODULE_INTERNAL_SECRET`. A normal module,
  widget, app, or browser caller cannot mint tokens by sending a valid JWT.
- Token lifecycle mutations (`setModuleTokenExpiry`, `setUserTokenExpiry`,
  `revokeToken`, refresh-token events) require scoped Auth core payloads.
  `setModuleTokenExpiry` uses `targetModuleName` for the module being
  configured, so the caller identity remains `moduleName: "auth"`.
- `revokeAllTokensForUser` also accepts a scoped `userManagement` core payload
  for account deletion flows. It does not accept unscoped `{ userId }` calls.

## Adding Login Strategies
See [Adding OAuth and Custom Login Strategies](../how_login_strategies_work.md) for a step‑by‑step guide on implementing new strategies and keeping secrets safe.
