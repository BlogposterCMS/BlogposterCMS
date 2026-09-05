const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createAuthRoutes, safeAdminRedirectTarget } = require('../mother/server/http/authRoutes');
const express = require('express');
const cookieParser = require('cookie-parser');
const axios = require('axios');

function testLoginRoute() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'mother/server/http/authRoutes.js'), 'utf8');
  const compositionSource = fs.readFileSync(path.join(__dirname, '..', 'mother/server/createBlogposterApp.js'), 'utf8');
  const adminShellSource = fs.readFileSync(path.join(__dirname, '..', 'mother/server/http/adminShellRoutes.js'), 'utf8');
  assert(
    source.includes("res.redirect('/admin/home')"),
    'Login route does not redirect authenticated users to /admin/home'
  );
  assert(
    source.includes("Cache-Control', 'no-store"),
    'Login route missing no-store Cache-Control header'
  );
  assert(
    source.includes("maybeIssueDevAdminSession(req, res, 'login route')"),
    'Login route does not issue a server-side dev autologin session'
  );
  assert(
    compositionSource.includes('maybeIssueDevAdminSession: authContext.maybeIssueDevAdminSession'),
    'Server composition does not pass the dev autologin issuer into auth routes'
  );
  assert(
    adminShellSource.includes("maybeIssueDevAdminSession(req, res, 'admin home')"),
    'Admin home route does not use server-side dev autologin'
  );
  assert(
    adminShellSource.includes("maybeIssueDevAdminSession(req, res, 'admin app')"),
    'Admin app route does not use server-side dev autologin'
  );
}

test('login route redirects when authenticated and disables caching', () => {
  testLoginRoute();
});

test('login route keeps dev autologin redirects scoped to admin paths', () => {
  assert.strictEqual(safeAdminRedirectTarget('/admin/app/designer?x=1#top'), '/admin/app/designer?x=1#top');
  assert.strictEqual(safeAdminRedirectTarget('https://evil.example/admin'), '/admin/home');
  assert.strictEqual(safeAdminRedirectTarget('/login'), '/admin/home');
  assert.strictEqual(safeAdminRedirectTarget(''), '/admin/home');
});

test('CMS login uses the admin namespace and leaves public login to the site', async () => {
  const app = express();
  app.use(cookieParser());
  const csrfProtection = (req, _res, next) => {
    req.csrfToken = () => 'test-csrf-token';
    next();
  };
  app.use(createAuthRoutes({
    csrfProtection,
    injectDevBanner: html => html,
    isDevAutoLoginAllowed: async () => false,
    isProduction: true,
    loginLimiter: (_req, _res, next) => next(),
    needsInitialSetup: async () => false,
    publicPath: path.join(__dirname, '..', 'public'),
    validateAdminToken: async token => {
      if (token !== 'valid-test-token') throw new Error('TEST_INVALID_TOKEN');
    }
  }));
  // A site's public page or redirect must remain reachable after auth routing.
  app.get('/login', (_req, res) => res.redirect(302, '/site-account'));
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const client = axios.create({
    baseURL: `http://127.0.0.1:${server.address().port}`,
    maxRedirects: 0,
    validateStatus: () => true
  });
  try {
    const publicLogin = await client.get('/login');
    assert.strictEqual(publicLogin.status, 302);
    assert.strictEqual(publicLogin.headers.location, '/site-account');
    assert.strictEqual(publicLogin.headers['set-cookie'], undefined);

    const adminLogin = await client.get('/admin/login');
    assert.strictEqual(adminLogin.status, 200);
    assert(adminLogin.data.includes('/build/login.js'));
    assert(adminLogin.data.includes('test-csrf-token'));
    assert(adminLogin.headers['cache-control'].includes('no-store'));

    const authenticated = await client.get('/admin/login', {
      headers: { Cookie: 'admin_jwt=valid-test-token' }
    });
    assert.strictEqual(authenticated.status, 302);
    assert.strictEqual(authenticated.headers.location, '/admin/home');

    const logout = await client.get('/admin/logout');
    assert.strictEqual(logout.headers.location, '/admin/login');
    assert(logout.headers['set-cookie'].some(cookie => cookie.startsWith('admin_jwt=;')));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
