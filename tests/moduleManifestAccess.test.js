const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');
const { createCommunityModuleHost, createCommunityHealthCheckHost } = require('../mother/modules/moduleLoader/moduleHost');
const { normalizeModuleInfoAccess, preserveTrustedAccess } = require('../mother/modules/moduleLoader/moduleAccessPolicy');

let root;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-consent-')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
function moduleInfo() {
  return { accessPolicyVersion: 1, requestedAccess: [{ resource: 'content', action: 'list', event: 'listContentEntries' }], trustedAccessGrants: [{ resource: 'content', action: 'list', event: 'listContentEntries', granted: true }] };
}
test('a running module rereads current grants; revocation cannot reopen a consent prompt', async () => {
  const emitter = new EventEmitter();
  let info = moduleInfo();
  emitter.on('dbSelect', (_payload, cb) => cb(null, [{ module_info: JSON.stringify(info) }]));
  const handler = jest.fn((_payload, cb) => cb(null, []));
  emitter.on('listContentEntries', handler);
  const consent = { requestAccess: jest.fn() };
  const host = createCommunityModuleHost({ motherEmitter: emitter, moduleName: 'sample', moduleInfo: info, moduleDir: root, jwt: 'token', nonce: 'nonce', accessGrants: ['listContentEntries'], accessConsentManager: consent });
  await host.eventBus.emit('listContentEntries', {}, () => {});
  expect(handler).toHaveBeenCalledTimes(1);
  info = { ...info, trustedAccessGrants: [] };
  await expect(host.eventBus.emit('listContentEntries', {}, () => {})).rejects.toThrow('E_MODULE_ACCESS_DENIED');
  expect(handler).toHaveBeenCalledTimes(1);
  expect(consent.requestAccess).not.toHaveBeenCalled();
});

test('undeclared events stay denied even with forged or stale grants', async () => {
  const emitter = new EventEmitter();
  const info = { ...moduleInfo(), requestedAccess: [] };
  emitter.on('dbSelect', (_payload, cb) => cb(null, [{ module_info: JSON.stringify(info) }]));
  const host = createCommunityModuleHost({ motherEmitter: emitter, moduleName: 'sample', moduleInfo: info, moduleDir: root, jwt: 'token', nonce: 'nonce', accessGrants: ['listContentEntries'] });
  await expect(host.eventBus.emit('listContentEntries', {}, () => {})).rejects.toThrow('E_MODULE_ACCESS_DENIED');
});

test('health check enforces the same manifest access before activation', () => {
  const host = createCommunityHealthCheckHost({ moduleName: 'sample', moduleInfo: moduleInfo(), moduleDir: root, jwt: 'token', nonce: 'nonce', markEvent: jest.fn(), accessGrants: [] });
  expect(() => host.eventBus.emit('listContentEntries', {}, () => {})).toThrow('E_MODULE_ACCESS_DENIED');
});

test('package metadata cannot supply trusted grants or opt out of administrator policy', () => {
  const raw = { moduleName: 'sample', accessPolicyVersion: 0, trustedAccessGrants: moduleInfo().trustedAccessGrants, requestedAccess: [{ resource: 'content', action: 'list' }] };
  const normalized = normalizeModuleInfoAccess(raw, 'sample');
  expect(normalized.trustedAccessGrants).toEqual([]);
  expect(normalized.accessPolicyVersion).toBeUndefined();
  expect(preserveTrustedAccess(normalized, moduleInfo()).accessPolicyVersion).toBe(1);
});

test('access management rejects actors without management or target permissions', async () => {
  const { initModuleRegistryAdminEvents } = require('../mother/modules/moduleLoader/moduleRegistryEvents');
  const emitter = new EventEmitter();
  initModuleRegistryAdminEvents(emitter, {});
  const send = decodedJWT => new Promise((resolve, reject) => emitter.emit('setModuleAccess', {
    jwt: 'token', moduleName: 'moduleLoader', moduleType: 'core', targetModuleName: 'sample',
    decodedJWT, approvedAccess: [{ resource: 'content', action: 'list' }]
  }, (err, result) => err ? reject(err) : resolve(result)));
  await expect(send({ permissions: {} })).rejects.toThrow('E_MODULE_ACCESS_CONSENT_PERMISSION');
  await expect(send({ permissions: { modules: { manageAccess: true } } })).rejects.toThrow('E_MODULE_ACCESS_APPROVAL_PERMISSION');
});
