const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testLoginRoute() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'mother/server/http/authRoutes.js'), 'utf8');
  assert(
    source.includes("res.redirect('/admin/home')"),
    'Login route does not redirect authenticated users to /admin/home'
  );
  assert(
    source.includes("Cache-Control', 'no-store"),
    'Login route missing no-store Cache-Control header'
  );
}

test('login route redirects when authenticated and disables caching', () => {
  testLoginRoute();
});
