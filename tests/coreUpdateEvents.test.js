const EventEmitter = require('events');
jest.mock('../mother/modules/moduleLoader/coreUpdateService', () => ({ getCoreUpdateStatus: jest.fn(), requestHost: jest.fn() }));
const service = require('../mother/modules/moduleLoader/coreUpdateService');
const { initializeCoreUpdateEvents } = require('../mother/modules/moduleLoader/coreUpdateEvents');
const base = { jwt: 'verified', moduleName: 'moduleLoader', moduleType: 'core', decodedJWT: { permissions: { settings: { core: { edit: true } } } } };
let emitter;
beforeEach(() => { jest.clearAllMocks(); emitter = new EventEmitter(); initializeCoreUpdateEvents(emitter); });
function emit(event, payload) { return new Promise(resolve => emitter.emit(event, payload, (err, data) => resolve({ err, data }))); }
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
