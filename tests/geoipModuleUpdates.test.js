'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { createCoreModuleLifecycle } = require('../mother/server/bootstrap/coreModuleLifecycle');
const { loadCoreModuleCode } = require('../mother/server/bootstrap/coreModuleCode');

// Real private generation loading must retain the existing host ingress and its
// provider concurrency state, including a candidate rejected before activation.
test('GeoIP replacement and failed readiness retain provider state and authenticated handlers', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-geoip-update-'));
  const canonicalModuleDir = path.resolve(__dirname, '../mother/modules/geoipManager');
  fs.cpSync(canonicalModuleDir, directory, { recursive: true });
  const service = require('../mother/modules/geoipManager/service');
  let releaseLookup;
  const active = { lookup: jest.fn(() => new Promise(resolve => { releaseLookup = resolve; })) };
  const deactivate = service.activate(active);
  const emitter = new EventEmitter();
  emitter._moduleTypes = { analyticsManager: 'core' };
  emitter.registerModuleType = (name, type) => { emitter._moduleTypes[name] = type; };
  const lifecycle = createCoreModuleLifecycle(emitter);
  const payload = { decodedJWT: { moduleName: 'analyticsManager' }, moduleType: 'core', ip: '8.8.8.8' };
  const call = () => new Promise((resolve, reject) => emitter.emit('geoipLookup', payload, (error, value) => error ? reject(error) : resolve(value)));
  try {
    await lifecycle.start('geoipManager', require(canonicalModuleDir), { isCore: true, jwt: 'fixture', serviceEmitter: emitter });
    const ingressWork = service.lookup('8.8.8.8');
    const next = loadCoreModuleCode({ moduleName: 'geoipManager', moduleDir: directory, canonicalModuleDir });
    await lifecycle.replace('geoipManager', next, { healthCheck: next.healthCheck });
    releaseLookup({ status: 'GEOIP_OK', country: 'CH' });
    await expect(ingressWork).resolves.toEqual({ status: 'GEOIP_OK', country: 'CH' });
    expect(service.getOrCreateService({})).toBe(active);
    await expect(lifecycle.replace('geoipManager', next, { healthCheck: async () => { throw new Error('GEOIP_TEST_READINESS'); } })).rejects.toThrow('GEOIP_TEST_READINESS');
    expect(service.getOrCreateService({})).toBe(active);
    active.lookup.mockResolvedValue({ status: 'GEOIP_OK', country: 'CH' });
    await expect(call()).resolves.toEqual({ status: 'GEOIP_OK', country: 'CH' });
    expect(emitter.listenerCount('geoipLookup')).toBe(1);
    expect(lifecycle.snapshot()[0]).toMatchObject({ state: 'active', recoveryRequired: false });
  } finally {
    deactivate();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
