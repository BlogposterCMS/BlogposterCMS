'use strict';

const { EventEmitter } = require('events');
const { createCoreModuleScope } = require('../mother/server/bootstrap/coreModuleScope');
const { createCoreModuleLifecycle } = require('../mother/server/bootstrap/coreModuleLifecycle');

function fixture() {
  const emitter = new EventEmitter();
  const scope = createCoreModuleScope(emitter, 'translationManager');
  scope.activate();
  return { emitter, scope };
}

test('owned intervals wait for activation, drain their work, and resume after failed readiness', async () => {
  const emitter = new EventEmitter();
  const scope = createCoreModuleScope(emitter, 'scheduledModule', { deferred: true });
  let finish;
  const work = new Promise(resolve => { finish = resolve; });
  const tick = jest.fn(() => work);
  scope.every(1000, tick, { immediate: true });
  expect(tick).not.toHaveBeenCalled();
  scope.activate();
  expect(tick).toHaveBeenCalledTimes(1);
  const drained = scope.drain();
  expect(scope.snapshot().pending).toBe(1);
  finish();
  await drained;
  scope.activate();
  expect(tick).toHaveBeenCalledTimes(2);
  await scope.drain();
  await scope.dispose();
});

test('an admitted async handler can finish nested module calls while new callers are gated', async () => {
  const emitter = new EventEmitter();
  const scope = createCoreModuleScope(emitter, 'nestedModule');
  let continueOuter;
  const gate = new Promise(resolve => { continueOuter = resolve; });
  scope.emitter.on('nested', (_payload, callback) => callback(null, 'completed'));
  scope.emitter.on('outer', async (_payload, callback) => {
    await gate;
    scope.emitter.emit('nested', {}, callback);
  });
  scope.activate();
  const reply = jest.fn();
  emitter.emit('outer', {}, reply);
  const draining = scope.drain();
  const rejected = jest.fn();
  emitter.emit('nested', {}, rejected);
  expect(rejected.mock.calls[0][0].code).toBe('CORE_MODULE_UPDATING');
  continueOuter();
  await draining;
  expect(reply).toHaveBeenCalledWith(null, 'completed');
  await scope.dispose();
});

test('candidate with missing event handlers cannot replace the active generation', async () => {
  const emitter = new EventEmitter();
  const lifecycle = createCoreModuleLifecycle(emitter);
  const old = jest.fn();
  await lifecycle.start('example', { lifecycleVersion: 1, initialize: ({ motherEmitter }) => motherEmitter.on('read', old) }, {});
  await expect(lifecycle.replace('example', { lifecycleVersion: 1, initialize() {} }, { healthCheck: async () => {} }))
    .rejects.toMatchObject({ code: 'CORE_MODULE_EVENT_SURFACE_CHANGED' });
  emitter.emit('read');
  expect(old).toHaveBeenCalledTimes(1);
  expect(lifecycle.snapshot()[0].state).toBe('active');
});

test('disposal removes only the module registrations and preserves the host emitter', async () => {
  const { emitter, scope } = fixture();
  const other = jest.fn();
  const owned = jest.fn();
  emitter.on('read', other);
  scope.emitter.on('read', owned);
  expect(emitter.listeners('read')[1].moduleName).toBe('translationManager');
  scope.emitter.emit('read', {});
  expect(other).toHaveBeenCalledTimes(1);
  expect(owned).toHaveBeenCalledTimes(1);
  await scope.drain();
  await scope.dispose();
  emitter.emit('read', {});
  expect(other).toHaveBeenCalledTimes(2);
  expect(owned).toHaveBeenCalledTimes(1);
});

test('draining waits for delayed callbacks while unrelated modules keep responding', async () => {
  const { emitter, scope } = fixture();
  let reply;
  scope.emitter.on('upload', (_request, callback) => { reply = callback; });
  emitter.on('other', callback => callback('available'));
  const response = jest.fn();
  emitter.emit('upload', {}, response);
  const drained = scope.drain(1000);
  const rejected = jest.fn();
  emitter.emit('upload', {}, rejected);
  expect(rejected.mock.calls[0][0].code).toBe('CORE_MODULE_UPDATING');
  const other = jest.fn();
  emitter.emit('other', other);
  expect(other).toHaveBeenCalledWith('available');
  expect(scope.snapshot().pending).toBe(1);
  reply(null, 'saved');
  await drained;
  expect(response).toHaveBeenCalledWith(null, 'saved');
  expect(scope.snapshot().pending).toBe(0);
});

test('replying early does not retire an async handler that is still working', async () => {
  const { emitter, scope } = fixture();
  let finish;
  scope.emitter.on('work', async (_request, callback) => {
    callback(null, 'accepted');
    await new Promise(resolve => { finish = resolve; });
  });
  emitter.emit('work', {}, jest.fn());
  expect(scope.snapshot().pending).toBe(1);
  const drained = scope.drain();
  finish();
  await drained;
  expect(scope.snapshot().pending).toBe(0);
});

test('drain timeout keeps the current module usable and refuses disposal', async () => {
  const { emitter, scope } = fixture();
  let reply;
  scope.emitter.on('work', (_request, callback) => { reply = callback; });
  emitter.emit('work', {}, jest.fn());
  await expect(scope.drain(5)).rejects.toMatchObject({ code: 'CORE_MODULE_DRAIN_TIMEOUT' });
  expect(scope.snapshot().state).toBe('active');
  await expect(scope.dispose()).rejects.toMatchObject({ code: 'CORE_MODULE_STILL_BUSY' });
  reply(null);
  await scope.dispose();
});

test('once and removing duplicate listeners retain EventEmitter semantics', async () => {
  const { emitter, scope } = fixture();
  const listener = jest.fn();
  scope.emitter.once('once', listener);
  emitter.emit('once'); emitter.emit('once');
  expect(listener).toHaveBeenCalledTimes(1);
  scope.emitter.on('repeat', listener).on('repeat', listener);
  scope.emitter.off('repeat', listener);
  expect(emitter.listenerCount('repeat')).toBe(1);
  await scope.dispose();
  expect(emitter.listenerCount('repeat')).toBe(0);
});

test('cleanup runs in reverse order even when one cleanup fails', async () => {
  const { scope } = fixture();
  const order = [];
  scope.onCleanup(() => order.push(1));
  scope.onCleanup(() => { order.push(2); throw new Error('failed'); });
  scope.onCleanup(() => order.push(3));
  await expect(scope.dispose()).rejects.toThrow('CORE_MODULE_CLEANUP_FAILED');
  expect(order).toEqual([3, 2, 1]);
  expect(() => scope.emitter.on('read', jest.fn())).toThrow('CORE_MODULE_SCOPE_CLOSED');
});

test('authenticated emission uses the original emitter method and receiver', () => {
  const { emitter, scope } = fixture();
  emitter.emit = jest.fn(function (event, payload) {
    expect(this).toBe(emitter);
    expect(payload).toEqual({ jwt: 'opaque-token' });
    return event === 'allowed';
  });
  expect(scope.emitter.emit('allowed', { jwt: 'opaque-token' })).toBe(true);
});

test('refreshes only the captured host credential without mutating caller payloads', () => {
  const emitter = new EventEmitter();
  const credentialProvider = {
    currentToken: () => 'renewed-core-token',
    getToken: jest.fn()
  };
  const scope = createCoreModuleScope(emitter, 'runtimeManager', {
    credentialProvider,
    capturedTokens: ['bootstrap-core-token']
  });
  scope.activate();
  const seen = [];
  emitter.on('dispatch', payload => seen.push(payload));
  const bootstrapPayload = { jwt: 'bootstrap-core-token', moduleName: 'runtimeManager' };
  const forwardedPublicPayload = { jwt: 'fresh-public-token', moduleName: 'runtimeManager' };
  const forwardedUserPayload = { jwt: 'fresh-user-token', moduleName: 'runtimeManager' };
  const bootstrapAliasPayload = { jwtToken: 'bootstrap-core-token', moduleName: 'runtimeManager' };

  scope.emitter.emit('dispatch', bootstrapPayload);
  scope.emitter.emit('dispatch', forwardedPublicPayload);
  scope.emitter.emit('dispatch', forwardedUserPayload);
  scope.emitter.emit('dispatch', bootstrapAliasPayload);

  expect(seen).toEqual([
    { jwt: 'renewed-core-token', moduleName: 'runtimeManager' },
    forwardedPublicPayload,
    forwardedUserPayload,
    { jwtToken: 'renewed-core-token', moduleName: 'runtimeManager' }
  ]);
  expect(bootstrapPayload.jwt).toBe('bootstrap-core-token');
  expect(bootstrapAliasPayload.jwtToken).toBe('bootstrap-core-token');
  expect(credentialProvider.getToken).not.toHaveBeenCalled();
});

test('issuance failure calls back without dispatching the protected action', async () => {
  const emitter = new EventEmitter();
  const issuanceError = Object.assign(new Error('renewal unavailable'), {
    code: 'CORE_MODULE_CREDENTIAL_ISSUANCE_FAILED'
  });
  const scope = createCoreModuleScope(emitter, 'runtimeManager', {
    credentialProvider: {
      currentToken: () => null,
      getToken: async () => { throw issuanceError; }
    },
    capturedTokens: ['bootstrap-core-token']
  });
  scope.activate();
  const handler = jest.fn();
  emitter.on('protected', handler);

  let callbackError;
  const completed = new Promise(resolve => {
    expect(scope.emitter.emit('protected', { jwt: 'bootstrap-core-token' }, error => {
      callbackError = error;
      resolve();
    })).toBe(true);
  });
  await completed;

  expect(callbackError).toBe(issuanceError);
  expect(handler).not.toHaveBeenCalled();
  expect(scope.snapshot().pending).toBe(0);
});

test('disposing during credential renewal cancels the deferred dispatch', async () => {
  const emitter = new EventEmitter();
  let release;
  const renewal = new Promise(resolve => { release = resolve; });
  const scope = createCoreModuleScope(emitter, 'runtimeManager', {
    credentialProvider: {
      currentToken: () => null,
      getToken: () => renewal
    },
    capturedTokens: ['bootstrap-core-token']
  });
  scope.activate();
  const handler = jest.fn();
  const callback = jest.fn();
  emitter.on('protected', handler);
  scope.emitter.emit('protected', { jwt: 'bootstrap-core-token' }, callback);

  expect(scope.snapshot().pending).toBe(1);
  await scope.dispose();
  release('renewed-core-token');
  await Promise.resolve();
  await Promise.resolve();

  expect(callback.mock.calls[0][0]).toMatchObject({ code: 'CORE_MODULE_SCOPE_CLOSED' });
  expect(handler).not.toHaveBeenCalled();
});

test('draining waits for credential renewal and its admitted dispatch', async () => {
  const emitter = new EventEmitter();
  let release;
  const renewal = new Promise(resolve => { release = resolve; });
  const scope = createCoreModuleScope(emitter, 'runtimeManager', {
    credentialProvider: {
      currentToken: () => null,
      getToken: () => renewal
    },
    capturedTokens: ['bootstrap-core-token']
  });
  scope.activate();
  let reply;
  let markDispatched;
  const dispatched = new Promise(resolve => { markDispatched = resolve; });
  const handler = jest.fn((_payload, callback) => {
    reply = callback;
    markDispatched();
  });
  emitter.on('protected', handler);
  const callback = jest.fn();
  scope.emitter.emit('protected', { jwt: 'bootstrap-core-token' }, callback);

  const draining = scope.drain();
  expect(scope.snapshot()).toMatchObject({ state: 'draining', pending: 1 });
  release('renewed-core-token');
  await dispatched;

  expect(handler).toHaveBeenCalledWith({ jwt: 'renewed-core-token' }, expect.any(Function));
  expect(scope.snapshot().pending).toBe(1);
  reply(null, 'completed');
  await draining;
  reply(null, 'duplicate');
  expect(callback).toHaveBeenCalledWith(null, 'completed');
  expect(callback).toHaveBeenCalledTimes(1);
  expect(scope.snapshot().pending).toBe(0);
});

test('disposal refuses a renewed dispatch until its callback completes', async () => {
  const emitter = new EventEmitter();
  let release;
  const renewal = new Promise(resolve => { release = resolve; });
  const scope = createCoreModuleScope(emitter, 'runtimeManager', {
    credentialProvider: {
      currentToken: () => null,
      getToken: () => renewal
    },
    capturedTokens: ['bootstrap-core-token']
  });
  scope.activate();
  let reply;
  let markDispatched;
  const dispatched = new Promise(resolve => { markDispatched = resolve; });
  emitter.on('protected', (_payload, callback) => {
    reply = callback;
    markDispatched();
  });
  scope.emitter.emit('protected', { jwt: 'bootstrap-core-token' }, jest.fn());
  release('renewed-core-token');
  await dispatched;

  await expect(scope.dispose()).rejects.toMatchObject({ code: 'CORE_MODULE_STILL_BUSY' });
  reply(null, 'completed');
  await scope.dispose();
});

test('a synchronous downstream throw after renewal returns through the callback', async () => {
  const emitter = new EventEmitter();
  const scope = createCoreModuleScope(emitter, 'runtimeManager', {
    credentialProvider: {
      currentToken: () => null,
      getToken: async () => 'renewed-core-token'
    },
    capturedTokens: ['bootstrap-core-token']
  });
  scope.activate();
  const downstreamError = new Error('fixture downstream failure');
  emitter.on('protected', () => { throw downstreamError; });
  const callback = jest.fn();

  scope.emitter.emit('protected', { jwt: 'bootstrap-core-token' }, callback);
  await scope.drain();

  expect(callback).toHaveBeenCalledWith(downstreamError);
  expect(scope.snapshot().pending).toBe(0);
});

test('fire-and-forget renewal failures emit only a credential-safe warning', async () => {
  const emitter = new EventEmitter();
  const scope = createCoreModuleScope(emitter, 'runtimeManager', {
    credentialProvider: {
      currentToken: () => null,
      getToken: async () => { throw new Error('sensitive provider detail'); }
    },
    capturedTokens: ['bootstrap-core-token']
  });
  scope.activate();
  emitter.on('protected', jest.fn());
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});

  scope.emitter.emit('protected', { jwt: 'bootstrap-core-token' });
  await scope.drain();

  expect(warning).toHaveBeenCalledWith('[CORE_MODULE_DEFERRED_DISPATCH_FAILED]', 'runtimeManager');
  expect(JSON.stringify(warning.mock.calls)).not.toContain('sensitive provider detail');
  warning.mockRestore();
});

test('real MotherEmitter rejects an expired bootstrap token and accepts its renewed replacement', async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'core-lifecycle-mother-emitter-test';
  process.env.TOKEN_SALT_HIGH = process.env.TOKEN_SALT_HIGH || '';
  const jwt = require('jsonwebtoken');
  const singleton = require('../mother/emitters/motherEmitter').motherEmitter;
  const emitter = new singleton.constructor();
  const secret = emitter.combineSecretWithSalt(process.env.JWT_SECRET, 'high');
  const expired = jwt.sign({ moduleName: 'runtimeManager', trustLevel: 'high' }, secret, { expiresIn: -1 });
  const renewed = jwt.sign({ moduleName: 'runtimeManager', trustLevel: 'high' }, secret, { expiresIn: 60 });
  const protectedHandler = jest.fn((_payload, callback) => callback(null, 'accepted'));
  emitter.on('credentialLifecycleProtected', protectedHandler);

  const rejected = jest.fn();
  expect(emitter.emit('credentialLifecycleProtected', {
    jwt: expired,
    moduleName: 'runtimeManager',
    moduleType: 'core'
  }, rejected)).toBe(false);
  expect(rejected.mock.calls[0][0]).toMatchObject({ code: 'AUTH_TOKEN_EXPIRED' });

  const scope = createCoreModuleScope(emitter, 'runtimeManager', {
    credentialProvider: {
      currentToken: () => renewed,
      getToken: jest.fn()
    },
    capturedTokens: [expired]
  });
  scope.activate();
  const originalPayload = { jwt: expired, moduleName: 'runtimeManager', moduleType: 'core' };
  await expect(new Promise((resolve, reject) => {
    scope.emitter.emit('credentialLifecycleProtected', originalPayload, (error, value) => {
      if (error) reject(error);
      else resolve(value);
    });
  })).resolves.toBe('accepted');
  expect(originalPayload).toEqual({ jwt: expired, moduleName: 'runtimeManager', moduleType: 'core' });
  expect(protectedHandler).toHaveBeenCalledTimes(1);
  await scope.dispose();
});

function versionedModule(version, cleanup = () => {}) {
  return {
    lifecycleVersion: 1,
    async initialize({ motherEmitter, lifecycle }) {
      lifecycle.onCleanup(cleanup);
      motherEmitter.on('read', (_request, callback) => callback(null, version));
    }
  };
}

test('a module changes version without restarting unrelated handlers or the host', async () => {
  const emitter = new EventEmitter();
  const manager = createCoreModuleLifecycle(emitter);
  const oldCleanup = jest.fn();
  const unrelated = jest.fn();
  emitter.on('unrelated', unrelated);
  await manager.start('translationManager', versionedModule('old', oldCleanup), {});
  const result = await manager.replace('translationManager', versionedModule('new'), { healthCheck: async () => {} });
  const read = jest.fn();
  emitter.emit('read', {}, read);
  emitter.emit('unrelated');
  expect(read).toHaveBeenCalledWith(null, 'new');
  expect(oldCleanup).toHaveBeenCalledTimes(1);
  expect(unrelated).toHaveBeenCalledTimes(1);
  expect(emitter.listenerCount('read')).toBe(1);
  expect(result.restartedHost).toBe(false);
});

test('a retained host service emitter follows the active generation credential scope', async () => {
  const emitter = new EventEmitter();
  let currentToken = 'initial-core-token';
  const provider = {
    currentToken: () => currentToken,
    getToken: jest.fn()
  };
  const manager = createCoreModuleLifecycle(emitter, {
    credentialProviderForModule: () => provider
  });
  let retainedEmitter;
  let retainedJwt;
  const implementation = {
    lifecycleVersion: 1,
    initialize({ motherEmitter, serviceEmitter, jwt }) {
      retainedEmitter ||= serviceEmitter;
      retainedJwt ||= jwt;
      motherEmitter.on('serviceLookup', (_payload, callback) => {
        retainedEmitter.emit('serviceRequest', {
          jwt: retainedJwt,
          moduleName: 'geoipManager',
          moduleType: 'core'
        }, callback);
      });
    }
  };
  emitter.on('serviceRequest', (payload, callback) => callback(null, payload.jwt));
  await manager.start('geoipManager', implementation, {
    jwt: 'initial-core-token',
    serviceEmitter: emitter
  });

  currentToken = 'renewed-core-token';
  await manager.replace('geoipManager', implementation, { healthCheck: async () => {} });
  await expect(new Promise((resolve, reject) => {
    emitter.emit('serviceLookup', {}, (error, token) => error ? reject(error) : resolve(token));
  })).resolves.toBe('renewed-core-token');
});

test('failed readiness restores old closures and never exposes the candidate', async () => {
  const emitter = new EventEmitter();
  const manager = createCoreModuleLifecycle(emitter);
  const oldCleanup = jest.fn();
  const nextCleanup = jest.fn();
  await manager.start('translationManager', versionedModule('old', oldCleanup), {});
  await expect(manager.replace('translationManager', versionedModule('new', nextCleanup), {
    healthCheck: async () => {
      const read = jest.fn();
      emitter.emit('read', {}, read);
      expect(read.mock.calls[0][0].code).toBe('CORE_MODULE_UPDATING');
      throw new Error('unhealthy');
    }
  })).rejects.toThrow('unhealthy');
  const read = jest.fn();
  emitter.emit('read', {}, read);
  expect(read).toHaveBeenCalledWith(null, 'old');
  expect(oldCleanup).not.toHaveBeenCalled();
  expect(nextCleanup).toHaveBeenCalledTimes(1);
  expect(emitter.listenerCount('read')).toBe(1);
});

test('unmigrated modules require a host restart and concurrent changes are refused', async () => {
  const emitter = new EventEmitter();
  const manager = createCoreModuleLifecycle(emitter);
  await manager.start('kernel', { initialize() {} }, {});
  await expect(manager.replace('kernel', versionedModule('new'), { healthCheck() {} }))
    .rejects.toMatchObject({ code: 'CORE_MODULE_RESTART_REQUIRED' });
  await manager.start('translationManager', versionedModule('old'), {});
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  const replacement = manager.replace('translationManager', versionedModule('new'), { healthCheck: () => ready });
  await expect(manager.replace('translationManager', versionedModule('other'), { healthCheck() {} }))
    .rejects.toMatchObject({ code: 'CORE_MODULE_UPDATE_BUSY' });
  release();
  await replacement;
});

test('failed candidate cleanup blocks further replacements instead of claiming recovery', async () => {
  const emitter = new EventEmitter();
  const manager = createCoreModuleLifecycle(emitter);
  await manager.start('translationManager', versionedModule('old'), {});
  const broken = versionedModule('new', () => { throw new Error('resource still active'); });
  await expect(manager.replace('translationManager', broken, { healthCheck: async () => { throw new Error('not ready'); } }))
    .rejects.toThrow('CORE_MODULE_RECOVERY_REQUIRED');
  expect(manager.snapshot()[0]).toMatchObject({ recoveryRequired: true, state: 'draining' });
  await expect(manager.replace('translationManager', versionedModule('other'), { healthCheck() {} }))
    .rejects.toMatchObject({ code: 'CORE_MODULE_RECOVERY_REQUIRED' });
});

test('partial initialization cleanup failure also leaves the module in recovery', async () => {
  const emitter = new EventEmitter();
  const manager = createCoreModuleLifecycle(emitter);
  await manager.start('translationManager', versionedModule('old'), {});
  const broken = { lifecycleVersion: 1, initialize({ lifecycle }) {
    lifecycle.onCleanup(() => { throw new Error('cleanup failed'); });
    throw new Error('init failed');
  } };
  await expect(manager.replace('translationManager', broken, { healthCheck() {} }))
    .rejects.toMatchObject({ code: 'CORE_MODULE_INIT_CLEANUP_FAILED' });
  expect(manager.snapshot()[0].recoveryRequired).toBe(true);
});
