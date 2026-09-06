/** @jest-environment node */

const emit = jest.fn();
const browser = { location: { href: '/admin/login' }, blogposterApi: { emit } };
let checkFirstInstall: () => Promise<void>;

function installedResponse() {
  return { resource: 'settings', action: 'public', data: { FIRST_INSTALL_DONE: 'true' } };
}

beforeAll(async () => {
  // Observe navigation without a real page load; exercise the actual data client.
  (globalThis as any).window = browser;
  emit.mockResolvedValue(installedResponse());
  checkFirstInstall = require('../ui/shell/install/firstInstallCheck').checkFirstInstall;
  await checkFirstInstall();
});
beforeEach(() => {
  emit.mockReset();
  browser.location.href = '/admin/login';
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { delete (globalThis as any).window; });

test.each([0, 1, 2])('failure at check request %s keeps login', async failureIndex => {
  const replies = ['public', { resource: 'settings', action: 'public', data: { FIRST_INSTALL_DONE: 'false' } }, { resource: 'users', action: 'count', data: 0 }];
  for (let i = 0; i < failureIndex; i++) emit.mockResolvedValueOnce(replies[i]);
  emit.mockRejectedValueOnce(new Error('HTTP 503'));
  await checkFirstInstall();
  expect(browser.location.href).toBe('/admin/login');
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining('SHELL_INSTALL_CHECK_FAILED'), expect.any(Error));
});

test('completed installation skips user count', async () => {
  emit.mockResolvedValueOnce('public').mockResolvedValueOnce(installedResponse());
  await checkFirstInstall();
  expect(emit).toHaveBeenCalledTimes(2);
  expect(browser.location.href).toBe('/admin/login');
});

test.each([2, 'unexpected', null, -1, NaN])('nonzero or invalid user count %s keeps login', async count => {
  emit.mockResolvedValueOnce('public')
    .mockResolvedValueOnce({ resource: 'settings', action: 'public', data: { FIRST_INSTALL_DONE: 'false' } })
    .mockResolvedValueOnce({ resource: 'users', action: 'count', data: count });
  await checkFirstInstall();
  expect(browser.location.href).toBe('/admin/login');
});

test('confirmed incomplete installation with zero users redirects', async () => {
  emit.mockResolvedValueOnce('public')
    .mockResolvedValueOnce({ resource: 'settings', action: 'public', data: { FIRST_INSTALL_DONE: 'false' } })
    .mockResolvedValueOnce({ resource: 'users', action: 'count', data: 0 });
  await checkFirstInstall();
  expect(browser.location.href).toBe('/install');
});
