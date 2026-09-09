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
