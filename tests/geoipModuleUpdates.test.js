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

test('GeoIP provider transport remains usable after the original event scope is retired', async () => {
  jest.resetModules();
  const previousProvider = process.env.GEOIP_PROVIDER;
  const previousEndpoint = process.env.GEOIP_SERVICE_URL;
  process.env.GEOIP_PROVIDER = 'self-hosted';
  process.env.GEOIP_SERVICE_URL = 'https://geo.example/lookup';
  const emitter = new EventEmitter();
  emitter._moduleTypes = { analyticsManager: 'core' };
  emitter.registerModuleType = (name, type) => { emitter._moduleTypes[name] = type; };
  const transport = jest.fn((payload, callback) => callback(null, { status: 200, data: { country: { iso_code: 'CH' } } }));
  emitter.on('httpRequest', transport);
  const lifecycle = createCoreModuleLifecycle(emitter);
  const implementation = require('../mother/modules/geoipManager');
  const service = require('../mother/modules/geoipManager/service');
  try {
    await lifecycle.start('geoipManager', implementation, { isCore: true, jwt: 'fixture', serviceEmitter: emitter });
    await lifecycle.replace('geoipManager', implementation, { healthCheck: implementation.healthCheck });
    await expect(service.lookup('8.8.8.8')).resolves.toMatchObject({ status: 'GEOIP_OK', country: 'CH' });
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({ moduleName: 'geoipManager', url: 'https://geo.example/lookup/8.8.8.8' }), expect.any(Function));
  } finally {
    if (previousProvider === undefined) delete process.env.GEOIP_PROVIDER; else process.env.GEOIP_PROVIDER = previousProvider;
    if (previousEndpoint === undefined) delete process.env.GEOIP_SERVICE_URL; else process.env.GEOIP_SERVICE_URL = previousEndpoint;
  }
});
