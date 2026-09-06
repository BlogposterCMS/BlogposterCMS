const { coreUpdateNotification, getCoreUpdateStatus } = require('../mother/modules/moduleLoader/coreUpdateService');
const platform = require('../mother/modules/runtimeManager/facades/domains/platform');
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
