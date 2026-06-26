# Adding OAuth and Custom Login Strategies

This guide explains how to add new login strategies for the **Auth Module**. BlogposterCMS already provides `adminLocal`, `google` and `facebook` strategies. Additional strategies can be loaded automatically when placed under `mother/modules/auth/strategies`.

## Requirements
- The Auth Module must run as a core module.
- `JWT_SECRET` and `AUTH_MODULE_INTERNAL_SECRET` must be configured.
- Keep any OAuth client IDs or secrets outside of version control, preferably in environment variables or the settings store.

## Creating a Strategy
1. Create a new file under `mother/modules/auth/strategies/`.
2. Export an `initialize({ motherEmitter, JWT_SECRET, authModuleSecret })` function.
3. Inside the function emit `registerLoginStrategy` with `skipJWT: true`, `moduleType: 'core'`, `moduleName: 'auth'`, the `authModuleSecret`, a `strategyName`, a short `description` and a `loginFunction`.
4. The `loginFunction` is called during `loginWithStrategy`. It should validate the third‑party token, find or create the local user via meltdown events and finally emit `finalizeUserLogin` to receive the full user object.

Example skeleton:
```js
module.exports = {
  initialize({ motherEmitter, JWT_SECRET, authModuleSecret }) {
    motherEmitter.emit(
      'registerLoginStrategy',
      {
        skipJWT: true,
        moduleType: 'core',
        moduleName: 'auth',
        authModuleSecret,
        strategyName: 'myProvider',
        description: 'My OAuth login',
        loginFunction: async (token, callback) => {
          try {
            // 1) Validate `token` with the provider's API
            // 2) Find or create the local user using meltdown events
            // 3) Call `callback(null, finalUserObj)` when done
          } catch (err) {
            callback(err);
          }
        }
      },
      err => {
        if (err) console.error('[MY STRATEGY] Failed to register', err);
      }
    );
  }
};
```

## Security Notes
- Always verify tokens with the OAuth provider before trusting them.
- Never commit OAuth secrets to the repository.
- Disable a compromised strategy with the `setLoginStrategyEnabled` event.

## Enabling or Disabling Strategies
Use `setLoginStrategyEnabled` with a core JWT from an admin principal that has `auth.strategies.manage` to toggle a strategy:
```js
motherEmitter.emit(
  'setLoginStrategyEnabled',
  {
    jwt,
    moduleName: 'auth',
    moduleType: 'core',
    strategyName: 'google',
    enabled: true
  },
  callback
);
```
List the admin strategy configuration through `runtimeManager.cmsAdminApiRequest`
resource `auth`, action `loginStrategies`; it requires
`auth.strategies.view` or `auth.strategies.manage`. Public login discovery uses
the read-only `listActiveLoginStrategies` public-token contract.
