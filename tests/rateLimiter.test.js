const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testMiddlewareUsage() {
  const meltdownSource = fs.readFileSync(path.join(__dirname, '..', 'mother/server/http/meltdownRouter.js'), 'utf8');
  const authSource = fs.readFileSync(path.join(__dirname, '..', 'mother/server/http/authRoutes.js'), 'utf8');
  assert(
    !meltdownSource.includes("router.post('/api/meltdown', apiLimiter"),
    'apiLimiter should not be used on /api/meltdown route anymore'
  );
  assert(
    authSource.includes("router.post('/admin/api/login', loginLimiter"),
    'Missing loginLimiter on /admin/api/login route'
  );
}

test('rate limiter middleware is applied to critical routes', () => {
  testMiddlewareUsage();
});

