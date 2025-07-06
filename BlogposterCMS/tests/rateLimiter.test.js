const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testMiddlewareUsage() {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert(
    !appJs.includes("app.post('/api/meltdown', apiLimiter"),
    'apiLimiter should not be used on /api/meltdown route anymore'
  );
  assert(
    appJs.includes("app.post('/admin/api/login', loginLimiter"),
    'Missing loginLimiter on /admin/api/login route'
  );
}

test('rate limiter middleware is applied to critical routes', () => {
  testMiddlewareUsage();
});

