'use strict';

const { createCoreModuleUpdates } = require('../mother/modules/updater/coreModuleUpdates');

function fixture() {
  const generationId = 'a'.repeat(64);
  const lifecycle = { snapshot: () => [{ moduleName: 'translationManager', generation: { releaseVersion: '0.10.6' } }],
    replace: jest.fn(async (name, implementation, options) => {
      await options.healthCheck(implementation, {});
      await options.beforeActivate();
    }) };
  const implementation = { healthCheck: jest.fn(async () => {}) };
  const run = jest.fn(async () => ({ generationId, moduleDir: 'verified-code' }));
  const load = jest.fn(() => implementation);
  const service = createCoreModuleUpdates({ rootDir: process.cwd(), lifecycle, run, load });
  const check = async () => {
    service.observeRelease({ candidate: { available: true, latestVersion: '0.10.7' } });
    await service.settled();
  };
  const install = () => service.install({ moduleName: 'translationManager', generationId, version: '0.10.7' });
  return { service, run, load, implementation, lifecycle, generationId, check, install };
}

test('checks without executing code and persists only after candidate readiness', async () => {
  const f = fixture();
  await f.check();
  expect(f.load).not.toHaveBeenCalled();
  expect(f.install().status).toBe('installing');
  expect(f.service.busy()).toBe(true);
  await f.service.settled();
  expect(f.run.mock.calls.filter(([request]) => request.moduleName === 'translationManager').map(([request]) => request.operation)).toEqual(['stage-release', 'inspect', 'activate']);
  expect(f.implementation.healthCheck).toHaveBeenCalledTimes(1);
  expect(f.service.snapshot()[0].status).toBe('completed');
  expect(f.service.busy()).toBe(false);
});

test('rejects changed review and concurrent installation', async () => {
  const f = fixture(); await f.check();
  expect(() => f.service.install({ moduleName: 'translationManager', generationId: 'b'.repeat(64), version: '0.10.7' })).toThrow('CORE_MODULE_REVIEW_CHANGED');
  f.install();
  expect(f.install).toThrow('CORE_MODULE_UPDATE_BUSY');
  await f.service.settled();
});

test('verification failure prevents loading candidate code', async () => {
  const f = fixture(); await f.check();
  f.run.mockRejectedValueOnce(Object.assign(new Error('signature rejected'), { code: 'SIGNATURE_INVALID' }));
  f.install(); await f.service.settled();
  expect(f.load).not.toHaveBeenCalled();
  expect(f.lifecycle.replace).not.toHaveBeenCalled();
  expect(f.service.snapshot()[0]).toMatchObject({ status: 'error', errorCode: 'SIGNATURE_INVALID' });
});

test('readiness failure leaves persistent selection unchanged', async () => {
  const f = fixture(); await f.check();
  f.implementation.healthCheck.mockRejectedValue(new Error('storage unavailable'));
  f.install(); await f.service.settled();
  expect(f.run.mock.calls.some(([request]) => request.operation === 'activate')).toBe(false);
  expect(f.service.snapshot()[0].status).toBe('error');
});

test('host incompatibility offers no independent install', async () => {
  const f = fixture();
  f.run.mockRejectedValue(Object.assign(new Error('host changed'), { code: 'CORE_MODULE_HOST_INCOMPATIBLE' }));
  await f.check();
  expect(f.service.snapshot()[0]).toMatchObject({ status: 'host_required', available: false });
  expect(f.install).toThrow('CORE_MODULE_REVIEW_CHANGED');
});
