const { createGeoipService, normalizeLocation } = require('../mother/modules/geoipManager/service');
const webService = require('../mother/modules/geoipManager/providers/webService');

test('local MMDB adapter opens only the configured file and reuses its reader', async () => {
  const database = require('../mother/modules/geoipManager/providers/maxmindDatabase');
  await expect(database.create({})).rejects.toThrow('GEOIP_DATABASE_NOT_CONFIGURED');
  const get = jest.fn().mockReturnValue({ country: { iso_code: 'CH' } });
  const open = jest.spyOn(require('maxmind'), 'open').mockResolvedValue({ get });
  try {
    const reader = await database.create({ databasePath: '/fixture/GeoLite2-City.mmdb' });
    expect(await reader.lookup('8.8.8.8')).toEqual({ country: { iso_code: 'CH' } });
    expect(open).toHaveBeenCalledWith('/fixture/GeoLite2-City.mmdb');
    expect(get).toHaveBeenCalledWith('8.8.8.8');
  } finally { open.mockRestore(); }
});

test('shared module event permits verified core principals and rejects public/user/community calls', async () => {
  const handlers = new Map();
  const emitter = { _moduleTypes: { analyticsManager: 'core', untrusted: 'community' },
    registerModuleType(name, type) { this._moduleTypes[name] = type; },
    on: (name, handler) => handlers.set(name, handler), removeListener: name => handlers.delete(name) };
  const runtime = await require('../mother/modules/geoipManager').initialize({ motherEmitter: emitter, jwt: 'fixture', isCore: true });
  const call = payload => new Promise(resolve => handlers.get('geoipLookup')(payload, (error, result) => resolve({ error, result })));
  try {
    for (const decodedJWT of [{}, { isPublic: true }, { isUser: true, moduleName: 'analyticsManager' }, { moduleName: 'untrusted' }]) {
      expect((await call({ decodedJWT, moduleType: 'core' })).error.message).toBe('GEOIP_FORBIDDEN');
    }
    const trusted = { decodedJWT: { moduleName: 'analyticsManager', trustLevel: 'high' }, moduleType: 'core', ip: '8.8.8.8' };
    expect((await call(trusted)).result).toEqual({ status: 'GEOIP_DISABLED' });
    expect((await call({ ...trusted, isExternalRequest: true })).error.message).toBe('GEOIP_FORBIDDEN');
  } finally { runtime.shutdown(); }
});
test('unconfigured service is inert and rejects invalid/local addresses without requests', async () => {
  const request = jest.fn();
  expect(await createGeoipService({}, request).lookup('8.8.8.8')).toEqual({ status: 'GEOIP_DISABLED' });
  const service = createGeoipService({ provider: 'maxmind-web' }, request);
  for (const ip of ['127.0.0.1', '::1', '::ffff:192.168.0.2', 'fd00::1']) expect((await service.lookup(ip)).status).toBe('GEOIP_PRIVATE_ADDRESS');
  expect((await service.lookup('not-an-ip')).status).toBe('GEOIP_IP_INVALID');
  expect((await service.lookup('8.8.8.8')).status).toBe('GEOIP_CREDENTIALS_NOT_CONFIGURED');
  expect(request).not.toHaveBeenCalled();
});
test('provider result is minimized and adapter failures never reveal private details', async () => {
  expect(normalizeLocation({ country: { iso_code: 'CH' }, city: { names: { en: 'Basel' } }, traits: { ip_address: 'secret' }, location: { latitude: 47 } })).toEqual({ status: 'GEOIP_OK', country: 'CH', region: '', city: 'Basel', timezone: '' });
  const service = createGeoipService({ provider: 'test' }, null, { test: { create: async () => { throw new Error('password-path'); } } });
  expect(await service.lookup('8.8.8.8')).toEqual({ status: 'GEOIP_PROVIDER_UNAVAILABLE' });
});
test('prepared paid and self-hosted services only use the injected canonical HTTP transport', async () => {
  const request = jest.fn().mockResolvedValue({ status: 200, data: { country: { iso_code: 'CH' } } });
  const paid = await webService.create({ provider: 'maxmind-web', accountId: 'fixture', licenseKey: 'fixture' }, request);
  await paid.lookup('8.8.8.8');
  expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://geoip.maxmind.com/geoip/v2.1/city/8.8.8.8' }));
  const self = await webService.create({ provider: 'self-hosted', endpoint: 'https://geo.example/lookup' }, request);
  await self.lookup('2001:4860:4860::8888');
  expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'https://geo.example/lookup/2001%3A4860%3A4860%3A%3A8888' }));
  await expect(webService.create({ provider: 'self-hosted', endpoint: 'http://localhost' }, request)).rejects.toThrow('GEOIP_ENDPOINT_INVALID');
});
