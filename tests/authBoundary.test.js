'use strict';

const assert = require('assert');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const authModule = require('../mother/modules/auth');

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

function withoutBundledStrategies(fn) {
  const originalExistsSync = fs.existsSync;
  const strategyPathSuffix = `${path.sep}mother${path.sep}modules${path.sep}auth${path.sep}strategies`;

  fs.existsSync = function existsSyncPatched(filePath) {
    const resolved = path.resolve(String(filePath));
    if (resolved.endsWith(strategyPathSuffix)) return false;
    return originalExistsSync.apply(this, arguments);
  };

  try {
    return fn();
  } finally {
    fs.existsSync = originalExistsSync;
  }
}

function initializeAuthForTest() {
  const emitter = new EventEmitter();
  process.env.AUTH_MODULE_INTERNAL_SECRET = 'test-auth-secret';
  delete global.loginStrategies;

  withoutBundledStrategies(() => {
    authModule.initialize({
      motherEmitter: emitter,
      JWT_SECRET: 'test-jwt-secret',
      isCore: true
    });
  });

  global.loginStrategies = {
    adminLocal: {
      description: 'Local admin login',
      isEnabled: true,
      scope: 'admin'
    },
    google: {
      description: 'Google OAuth login',
      isEnabled: false,
      scope: 'public'
    }
  };

  return emitter;
}

afterEach(() => {
  delete global.loginStrategies;
});

test('auth strategy management list requires a verified strategy permission', async () => {
  const emitter = initializeAuthForTest();
  const base = {
    jwt: 'token',
    moduleName: 'auth',
    moduleType: 'core'
  };

  const missingPrincipal = await emitAsync(emitter, 'listLoginStrategies', base);
  assert(missingPrincipal.err);
  assert.match(missingPrincipal.err.message, /auth\.strategies\.view/);

  const missingPermission = await emitAsync(emitter, 'listLoginStrategies', {
    ...base,
    decodedJWT: { permissions: {} }
  });
  assert(missingPermission.err);
  assert.match(missingPermission.err.message, /auth\.strategies\.view/);

  const withView = await emitAsync(emitter, 'listLoginStrategies', {
    ...base,
    decodedJWT: { permissions: { auth: { strategies: { view: true } } } }
  });
  assert.ifError(withView.err);
  assert.deepStrictEqual(withView.result.map(strategy => strategy.name).sort(), ['adminLocal', 'google']);

  const withManage = await emitAsync(emitter, 'listLoginStrategies', {
    ...base,
    decodedJWT: { permissions: { auth: { strategies: { manage: true } } } }
  });
  assert.ifError(withManage.err);
  assert.deepStrictEqual(withManage.result.map(strategy => strategy.name).sort(), ['adminLocal', 'google']);
});

test('auth strategy toggles require manage permission', async () => {
  const emitter = initializeAuthForTest();
  const base = {
    jwt: 'token',
    moduleName: 'auth',
    moduleType: 'core',
    strategyName: 'google',
    enabled: true
  };

  const withViewOnly = await emitAsync(emitter, 'setLoginStrategyEnabled', {
    ...base,
    decodedJWT: { permissions: { auth: { strategies: { view: true } } } }
  });
  assert(withViewOnly.err);
  assert.match(withViewOnly.err.message, /auth\.strategies\.manage/);
  assert.strictEqual(global.loginStrategies.google.isEnabled, false);

  const withManage = await emitAsync(emitter, 'setLoginStrategyEnabled', {
    ...base,
    decodedJWT: { permissions: { auth: { strategies: { manage: true } } } }
  });
  assert.ifError(withManage.err);
  assert.deepStrictEqual(withManage.result, { success: true });
  assert.strictEqual(global.loginStrategies.google.isEnabled, true);
});

test('active login strategy discovery remains read-only for public tokens', async () => {
  const emitter = initializeAuthForTest();

  const result = await emitAsync(emitter, 'listActiveLoginStrategies', {
    jwt: 'public-token',
    moduleName: 'auth',
    moduleType: 'core',
    decodedJWT: { isPublic: true, purpose: 'login', permissions: {} }
  });

  assert.ifError(result.err);
  assert.deepStrictEqual(result.result, [
    {
      name: 'adminLocal',
      description: 'Local admin login',
      scope: 'admin'
    }
  ]);
});

test('auth token issuance is reserved for the internal auth contract', async () => {
  const emitter = initializeAuthForTest();

  const forgedModuleToken = await emitAsync(emitter, 'issueModuleToken', {
    jwt: 'caller-token',
    moduleName: 'communityThing',
    moduleType: 'community',
    trustLevel: 'high',
    signAsModule: 'userManagement'
  });
  assert(forgedModuleToken.err);
  assert.match(forgedModuleToken.err.message, /internal auth payload required/);

  const forgedUserToken = await emitAsync(emitter, 'issueUserToken', {
    jwt: 'caller-token',
    moduleName: 'auth',
    moduleType: 'core',
    userId: 1,
    role: 'admin'
  });
  assert(forgedUserToken.err);
  assert.match(forgedUserToken.err.message, /internal auth payload required/);

  const internalModuleToken = await emitAsync(emitter, 'issueModuleToken', {
    skipJWT: true,
    authModuleSecret: 'test-auth-secret',
    moduleName: 'auth',
    moduleType: 'core',
    trustLevel: 'high',
    signAsModule: 'userManagement'
  });
  assert.ifError(internalModuleToken.err);
  assert.strictEqual(typeof internalModuleToken.result, 'string');
  assert(internalModuleToken.result.length > 20);
});

test('auth token lifecycle events require scoped core callers', async () => {
  const emitter = initializeAuthForTest();

  const unscopedModuleExpiry = await emitAsync(emitter, 'setModuleTokenExpiry', {
    targetModuleName: 'userManagement',
    expiryString: '5m'
  });
  assert(unscopedModuleExpiry.err);
  assert.match(unscopedModuleExpiry.err.message, /invalid core payload/);

  const scopedModuleExpiry = await emitAsync(emitter, 'setModuleTokenExpiry', {
    jwt: 'auth-token',
    moduleName: 'auth',
    moduleType: 'core',
    targetModuleName: 'userManagement',
    expiryString: '5m'
  });
  assert.ifError(scopedModuleExpiry.err);
  assert.deepStrictEqual(scopedModuleExpiry.result, { success: true, expiry: '5m' });

  const unscopedValidation = await emitAsync(emitter, 'validateToken', {
    tokenToValidate: 'abc'
  });
  assert(unscopedValidation.err);
  assert.match(unscopedValidation.err.message, /invalid core payload/);

  const unscopedRevokeAll = await emitAsync(emitter, 'revokeAllTokensForUser', {
    userId: 1
  });
  assert(unscopedRevokeAll.err);
  assert.match(unscopedRevokeAll.err.message, /invalid core payload/);

  const scopedRevokeAll = await emitAsync(emitter, 'revokeAllTokensForUser', {
    jwt: 'user-management-token',
    moduleName: 'userManagement',
    moduleType: 'core',
    userId: 1
  });
  assert.ifError(scopedRevokeAll.err);
  assert.deepStrictEqual(scopedRevokeAll.result, { success: true, count: 0 });
});

test('loginWithStrategy does not accept skipJWT as a standalone login bypass', async () => {
  const emitter = initializeAuthForTest();
  global.loginStrategies.adminLocal.loginFunction = (_payload, callback) => {
    callback(null, { id: 1, username: 'admin' });
  };

  const bypass = await emitAsync(emitter, 'loginWithStrategy', {
    skipJWT: true,
    strategy: 'adminLocal',
    payload: { username: 'admin', password: 'secret' }
  });
  assert(bypass.err);
  assert.match(bypass.err.message, /invalid payload/);

  const publicLogin = await emitAsync(emitter, 'loginWithStrategy', {
    jwt: 'public-login-token',
    moduleName: 'loginRoute',
    moduleType: 'public',
    decodedJWT: { isPublic: true, purpose: 'login' },
    strategy: 'adminLocal',
    payload: { username: 'admin', password: 'secret' }
  });
  assert.ifError(publicLogin.err);
  assert.deepStrictEqual(publicLogin.result, { id: 1, username: 'admin' });
});

test('validateToken checks user version with an internal userManagement token', async () => {
  const emitter = initializeAuthForTest();
  const scopedAgentToken = jwt.sign({
    userId: 'agent-user',
    role: 'agent',
    trustLevel: 'low',
    isUser: true,
    jti: 'agent-jti',
    tokenVersion: 3,
    permissions: { agent: { view: true } }
  }, 'test-jwt-secret' + (process.env.TOKEN_SALT_LOW || ''), { expiresIn: '15m' });
  let lookupPayload = null;

  emitter.on('getUserDetailsById', (payload, cb) => {
    lookupPayload = payload;
    cb(null, { id: payload.userId, token_version: 3 });
  });

  const result = await emitAsync(emitter, 'validateToken', {
    jwt: scopedAgentToken,
    moduleName: 'auth',
    moduleType: 'core',
    tokenToValidate: scopedAgentToken
  });

  assert.ifError(result.err);
  assert.strictEqual(result.result.userId, 'agent-user');
  assert(lookupPayload);
  assert.strictEqual(lookupPayload.moduleName, 'userManagement');
  assert.notStrictEqual(lookupPayload.jwt, scopedAgentToken);
});
