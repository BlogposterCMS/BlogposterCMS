const EventEmitter = require('events');
const { _internals: { setupRuntimeEvents } } = require('../mother/modules/runtimeManager');
const { setupAgentManagerEvents, _internals } = require('../mother/modules/agentManager');

test('CMS surface reporting retains AgentManager permissions and rejects public, app and foreign-surface writes', async () => {
  const emitter = new EventEmitter();
  setupRuntimeEvents(emitter);
  setupAgentManagerEvents(emitter);
  const invoke = (overrides = {}) => new Promise((resolve, reject) => emitter.emit('cmsAdminApiRequest', {
    jwt: 'test', moduleName: 'runtimeManager', moduleType: 'core', resource: 'agentSurface', action: 'publish',
    decodedJWT: { permissions: { agent: { surface: { write: true } } } },
    params: { appName: 'plainspace', surfaceId: 'cms.pages.facade-test', state: { dirty: true } }, ...overrides
  }, (error, value) => error ? reject(error) : resolve(value)));
  await expect(invoke()).resolves.toMatchObject({ data: { appName: 'plainspace', state: { dirty: true } } });
  await expect(invoke({ decodedJWT: { permissions: {} } })).rejects.toThrow(/Forbidden/);
  await expect(invoke({ decodedJWT: { isPublic: true, permissions: { '*': true } } })).rejects.toThrow(/admin principal/);
  await expect(invoke({ params: { appName: 'designer', surfaceId: 'studio.designer' } })).rejects.toThrow('CMS_AGENT_SURFACE_INVALID');
  await expect(invoke({ action: 'enqueue' })).rejects.toThrow(/Unknown CMS admin API action/);
  await expect(invoke({ appContext: { appName: 'third-party' } })).rejects.toThrow(/apps can only query/);
  _internals.surfaceSnapshots.delete('plainspace:cms.pages.facade-test');
});
