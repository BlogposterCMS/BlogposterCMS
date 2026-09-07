const { coreUpdateNotification, getCoreUpdateStatus } = require('../mother/modules/updater/coreUpdateService');
const platform = require('../mother/modules/runtimeManager/facades/domains/platform');
const EventEmitter = require('events');
jest.mock('../mother/modules/notificationManager/notificationManagerService', () => ({
  loadIntegrations: jest.fn(async () => ({})), getRecentNotifications: jest.fn(() => [{ id: 'ordinary' }])
}));

test('notification owner requests the updater event and preserves ordinary notices on failure', async () => {
  const emitter = new EventEmitter();
  const targets = [];
  let fail = false;
  emitter.on('getCoreUpdateStatus', (payload, callback) => {
    targets.push(payload);
    if (fail) return callback(new Error('host unavailable'));
    callback(null, { configured: true, candidate: { available: true, latestVersion: '0.10.0' } });
  });
  const notifications = require('../mother/modules/notificationManager');
  await notifications.initialize({ motherEmitter: emitter, isCore: true, jwt: 'core-token' });
  const get = () => new Promise((resolve, reject) => emitter.emit('getRecentNotifications', {
    jwt: 'user-token', moduleName: 'notificationManager', moduleType: 'core',
    includeCoreUpdates: true, decodedJWT: { permissions: { '*': true } }
  }, (err, data) => err ? reject(err) : resolve(data)));
  expect(await get()).toEqual([expect.objectContaining({ id: 'blogposter-update-0.10.0' }), { id: 'ordinary' }]);
  expect(targets[0]).toMatchObject({ jwt: 'core-token', moduleName: 'updater', moduleType: 'core' });
  fail = true;
  expect(await get()).toEqual([{ id: 'ordinary' }]);
});
test('notification visibility is determined from the caller, not the internal JWT or browser flag', () => {
  expect(platform.prepareAdminParams({ resource: 'notifications', params: { includeCoreUpdates: true }, actor: { permissions: {} } }).includeCoreUpdates).toBe(false);
  expect(platform.prepareAdminParams({ resource: 'notifications', params: {}, actor: { permissions: { '*': true } } }).includeCoreUpdates).toBe(true);
});
test('notification has stable version identity and a constrained update destination', () => {
  const state = { configured: true, lastCheckedAt: '2026-09-06', candidate: { available: true, latestVersion: '0.9.5' } };
  expect(coreUpdateNotification(state)).toMatchObject({ id: 'blogposter-update-0.9.5', actionPath: '/admin/settings/updates' });
  expect(coreUpdateNotification({ ...state, lastCheckedAt: 'later' }).id).toBe(coreUpdateNotification(state).id);
  expect(coreUpdateNotification({ ...state, configured: false })).toBeNull();
  expect(coreUpdateNotification({ configured: true, candidate: { available: false } })).toBeNull();
});
test('unprovisioned host reports unavailable without claiming that there are no updates', async () => {
  const state = await getCoreUpdateStatus();
  expect(state.installedVersion).toBeTruthy();
  if (!state.configured) expect(state).toMatchObject({ phase: 'unavailable', errorCode: expect.stringMatching(/^CORE_UPDATE_HOST_/) });
});
