const EventEmitter = require('events');
jest.mock('../mother/modules/updater/coreUpdateService', () => ({ getCoreUpdateStatus: jest.fn(), requestHost: jest.fn() }));
const service = require('../mother/modules/updater/coreUpdateService');
const { initializeCoreUpdateEvents } = require('../mother/modules/updater/coreUpdateEvents');
const base = { jwt: 'verified', moduleName: 'updater', moduleType: 'core', decodedJWT: { permissions: { settings: { core: { edit: true } } } } };
let emitter;
beforeEach(() => { jest.clearAllMocks(); emitter = new EventEmitter(); initializeCoreUpdateEvents(emitter); });
function emit(event, payload) { return new Promise(resolve => emitter.emit(event, payload, (err, data) => resolve({ err, data }))); }

test('batch uses the existing permission and host guards without dispatching a host install', async () => {
  const modules = { busy: () => false, installBatch: jest.fn(() => ({ status: 'installing' })) };
  emitter = new EventEmitter(); initializeCoreUpdateEvents(emitter, { coreModuleUpdates: modules });
  const targetModules = [{ moduleName: 'translationManager', generationId: 'a'.repeat(64), version: '0.10.7' }];
  service.getCoreUpdateStatus.mockResolvedValue({ configured: true, phase: 'available' });
  expect((await emit('installCoreUpdate', { ...base, targetModules, decodedJWT: {} })).err.message).toContain('CORE_UPDATE_FORBIDDEN');
  expect((await emit('installCoreUpdate', { ...base, targetModules, image: 'host' })).err.message).toBe('CORE_MODULE_SELECTION_INVALID');
  expect(modules.installBatch).not.toHaveBeenCalled();
  expect((await emit('installCoreUpdate', { ...base, targetModules })).err).toBeNull();
  expect(modules.installBatch).toHaveBeenCalledWith(targetModules);
  expect(service.requestHost).not.toHaveBeenCalled();
});
test.each(['getCoreUpdateStatus', 'checkCoreUpdate', 'installCoreUpdate'])('rejects unauthorized %s before host access', async event => {
  const { err } = await emit(event, { ...base, decodedJWT: { permissions: {} } });
  expect(err.message).toContain('CORE_UPDATE_FORBIDDEN'); expect(service.requestHost).not.toHaveBeenCalled();
  expect(service.getCoreUpdateStatus).not.toHaveBeenCalled();
});
test('install forwards only the candidate to the fixed host adapter', async () => {
  service.requestHost.mockResolvedValue({ phase: 'installing', jobId: 'job' });
  const result = await emit('installCoreUpdate', { ...base, version: '0.9.5', image: 'reviewed', command: 'arbitrary', socketPath: '/bad' });
  expect(result.err).toBeNull(); expect(service.requestHost).toHaveBeenCalledWith('install', { version: '0.9.5', image: 'reviewed' });
});

test('retired ModuleLoader identity cannot control core updates', async () => {
  const { err } = await emit('installCoreUpdate', { ...base, moduleName: 'moduleLoader' });
  expect(err.message).toContain('CORE_UPDATE_FORBIDDEN');
  expect(service.requestHost).not.toHaveBeenCalled();
});

test('module installs retain admin permission checks and bind only the reviewed identity', async () => {
  const modules = { busy: () => false, install: jest.fn(() => ({ status: 'installing' })) };
  emitter = new EventEmitter(); initializeCoreUpdateEvents(emitter, { coreModuleUpdates: modules });
  service.getCoreUpdateStatus.mockResolvedValue({ configured: true, phase: 'available' });
  const target = { ...base, targetModuleName: 'translationManager', generationId: 'a'.repeat(64), version: '0.10.7', sourceDir: '/unsafe' };
  expect((await emit('installCoreUpdate', { ...target, decodedJWT: {} })).err.message).toContain('CORE_UPDATE_FORBIDDEN');
  expect(modules.install).not.toHaveBeenCalled();
  expect((await emit('installCoreUpdate', target)).err).toBeNull();
  expect(modules.install).toHaveBeenCalledWith({ moduleName: 'translationManager', generationId: target.generationId, version: '0.10.7' });
  expect(service.requestHost).not.toHaveBeenCalled();
});

test('running module update prevents a simultaneous full host update', async () => {
  emitter = new EventEmitter(); initializeCoreUpdateEvents(emitter, { coreModuleUpdates: { busy: () => true } });
  expect((await emit('installCoreUpdate', { ...base, version: '0.10.7', image: 'reviewed' })).err.message).toBe('CORE_UPDATE_BUSY');
  expect(service.requestHost).not.toHaveBeenCalled();
});


test('cancel uses install permission and forwards only the exact job identity', async () => {
  const input = { ...base, operation: 'cancel', jobId: 'reviewed-job' };
  expect((await emit('installCoreUpdate', { ...input, decodedJWT: {} })).err.message).toContain('CORE_UPDATE_FORBIDDEN');
  expect((await emit('installCoreUpdate', { ...input, image: 'mixed' })).err.message).toBe('CORE_UPDATE_CANCEL_INVALID');
  await emit('installCoreUpdate', input);
  expect(service.requestHost).toHaveBeenCalledWith('cancel', { jobId: 'reviewed-job' });
});
