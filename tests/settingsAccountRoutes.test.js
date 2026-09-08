const path = require('path');

jest.mock('../mother/contracts/backendEventContracts', () => ({
  requestBackendEvent: jest.fn()
}));

const { requestBackendEvent } = require('../mother/contracts/backendEventContracts');
const { createAdminShellRoutes } = require('../mother/server/http/adminShellRoutes');

function createFixture(slug, token = 'fixture-token') {
  const validateAdminToken = jest.fn().mockResolvedValue({ id: 1 });
  const router = createAdminShellRoutes({
    csrfProtection: (_req, _res, next) => next(),
    escapeHtml: value => value,
    injectDevBanner: value => value,
    isProduction: false,
    maybeIssueDevAdminSession: jest.fn().mockResolvedValue(null),
    motherEmitter: {},
    plainSpaceVersion: 'fixture',
    publicPath: path.join(__dirname, '../public'),
    renderMode: 'client',
    sanitizeSlug: value => value,
    validateAdminToken
  });
  const route = router.stack.find(layer => layer.route?.path === '/admin/*').route;
  const handler = route.stack[route.stack.length - 1].handle;
  const req = {
    params: { 0: slug }, cookies: token ? { admin_jwt: token } : {},
    originalUrl: `/admin/${slug}`, csrfToken: () => 'fixture-csrf'
  };
  const res = { redirect: jest.fn(), clearCookie: jest.fn(), setHeader: jest.fn(), send: jest.fn() };
  const next = jest.fn();
  return { run: () => handler(req, res, next), res, next, validateAdminToken };
}

beforeEach(() => {
  jest.clearAllMocks();
  requestBackendEvent.mockResolvedValue({ id: 7, lane: 'admin', meta: { dashboardLayout: 'fixed' } });
});

test.each(['settings/users/edit/12', 'settings/login/edit'])(
  'direct loading of %s uses the registered account page and retains the detail URL', async slug => {
    const fixture = createFixture(slug);
    await fixture.run();
    expect(requestBackendEvent).toHaveBeenCalledWith(expect.anything(), expect.any(String), expect.objectContaining({
      jwt: 'fixture-token', slug: 'settings/users-access', lane: 'admin', moduleName: 'pagesManager'
    }));
    const html = fixture.res.send.mock.calls[0][0];
    expect(html).toContain(`window.PAGE_SLUG   = "${slug}"`);
    expect(html).toContain('window.PAGE_ID     = 7');
    expect(html).toContain('data-dashboard-layout="fixed"');
    expect(fixture.res.setHeader).toHaveBeenCalledWith('Content-Security-Policy', expect.stringContaining("'nonce-"));
  }
);

test('account detail requests still require an authenticated admin session', async () => {
  const fixture = createFixture('settings/users/edit/12', null);
  await fixture.run();
  expect(fixture.res.redirect).toHaveBeenCalledWith('/admin/login?redirectTo=%2Fadmin%2Fsettings%2Fusers%2Fedit%2F12');
  expect(requestBackendEvent).not.toHaveBeenCalled();
});

test('an invalid admin token cannot load an account detail shell', async () => {
  const fixture = createFixture('settings/login/edit');
  fixture.validateAdminToken.mockRejectedValue(new Error('fixture invalid token'));
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await fixture.run();
    expect(fixture.res.clearCookie).toHaveBeenCalledWith('admin_jwt', expect.objectContaining({ httpOnly: true }));
    expect(fixture.res.redirect).toHaveBeenCalled();
    expect(requestBackendEvent).not.toHaveBeenCalled();
  } finally {
    warning.mockRestore();
  }
});

test.each([null, { id: 7, lane: 'public' }])('a missing or non-admin account page fails closed: %j', async page => {
  requestBackendEvent.mockResolvedValue(page);
  const fixture = createFixture('settings/users/edit/12');
  await fixture.run();
  expect(fixture.next).toHaveBeenCalledWith();
  expect(fixture.res.send).not.toHaveBeenCalled();
});

test('other existing widget detail routes keep their numeric entity ID', async () => {
  const fixture = createFixture('content/pages/edit/42');
  await fixture.run();
  expect(requestBackendEvent).toHaveBeenCalledWith(expect.anything(), expect.any(String), expect.objectContaining({ slug: 'content/pages/edit' }));
  expect(fixture.res.send.mock.calls[0][0]).toContain('window.PAGE_ID     = 42');
});
