const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { safeAdminRedirectTarget } = require('../mother/server/http/authRoutes');

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
