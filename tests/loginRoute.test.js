const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testLoginRoute() {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert(
    appJs.includes("res.redirect('/admin/home')"),
    'Login route does not redirect authenticated users to /admin/home'
  );
  assert(
    appJs.includes("Cache-Control', 'no-store"),
    'Login route missing no-store Cache-Control header'
  );
}

test('login route redirects when authenticated and disables caching', () => {
  testLoginRoute();
});
