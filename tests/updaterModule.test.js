const EventEmitter = require('events');
const { coreModulesForApp } = require('../mother/server/bootstrap/coreModules');
const platform = require('../mother/modules/runtimeManager/facades/domains/platform');
const { assertUserManagedModuleName } = require('../mother/modules/moduleLoader/moduleOwnershipPolicy');
const { startUpdateChecks } = require('../mother/modules/updater/updateScheduler');
jest.mock('../mother/modules/updater/coreUpdateService', () => ({ requestHost: jest.fn(), getCoreUpdateStatus: jest.fn() }));
const { initialize } = require('../mother/modules/updater');

afterEach(() => jest.useRealTimers());

test('updater owns core startup and cannot be replaced by an optional module', () => {
  const modules = coreModulesForApp({});
  expect(modules.find(value => value.name === 'updater').path).toBe('mother/modules/updater');
  expect(() => assertUserManagedModuleName('updater', 'replaced')).toThrow('Core-owned');
  for (const action of Object.values(platform.adminActions.coreUpdates)) {
    expect(action).toMatchObject({ moduleName: 'updater', permission: 'settings.core.edit' });
  }
  expect(platform.publicActions.coreUpdates).toBeUndefined();
});

test('core initialization rejects invalid context and is idempotent', async () => {
  jest.useFakeTimers();
  await expect(initialize({})).rejects.toThrow('CORE_UPDATE_INIT_INVALID');
  const emitter = new EventEmitter(); emitter.registerModuleType = jest.fn();
  const context = { motherEmitter: emitter, isCore: true, jwt: 'module-token' };
  await initialize(context); await initialize(context);
  expect(emitter.registerModuleType).toHaveBeenCalledWith('updater', 'core');
  expect(emitter.listenerCount('installCoreUpdate')).toBe(1);
  expect(jest.getTimerCount()).toBe(2);
});

test.each(['installing', 'backing_up', 'restarting', 'rolling_back', 'recovery_failed'])('startup leaves durable %s job untouched', async phase => {
  jest.useFakeTimers();
  const request = jest.fn().mockResolvedValue({ phase });
  const stop = startUpdateChecks({ request });
  await jest.advanceTimersByTimeAsync(10000);
  expect(request.mock.calls).toEqual([['status']]);
  stop(); expect(jest.getTimerCount()).toBe(0);
});

test('discovery retries after unavailable hosting without overlapping requests', async () => {
  jest.useFakeTimers();
  const request = jest.fn().mockRejectedValueOnce(new Error('socket missing')).mockResolvedValue({ phase: 'current' });
  const onError = jest.fn(); const stop = startUpdateChecks({ request, onError });
  await jest.advanceTimersByTimeAsync(10000);
  expect(onError).toHaveBeenCalledWith('CORE_UPDATE_BACKGROUND_CHECK_FAILED');
  await jest.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
  expect(request).toHaveBeenLastCalledWith('check');
  stop();
});
