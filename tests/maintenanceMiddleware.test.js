const express = require('express');
const { createMaintenanceMiddleware } = require('../mother/server/http/maintenanceMiddleware');
const { publicRequestError } = require('../mother/server/http/publicRequestError');

async function serve(options, run) {
  const app = express();
  app.use(createMaintenanceMiddleware(options));
  app.get('*', (_req, res) => res.send('page'));
  app.use(publicRequestError);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('renewal rejection returns 503 through real Express middleware and later requests recover', async () => {
  let fail = true;
  await serve({
    getCachedCoreToken: async () => {
      if (fail) throw Object.assign(new Error('secret credential data'), { code: 'CORE_MODULE_CREDENTIAL_ISSUANCE_FAILED' });
      return 'fixture-token';
    },
    motherEmitter: { emit: (_event, _payload, cb) => { cb(null, 'false'); return true; } }
  }, async origin => {
    const failed = await fetch(origin);
    expect(failed.status).toBe(503);
    expect(failed.headers.get('cache-control')).toBe('no-store');
    expect(await failed.text()).not.toContain('secret');
    fail = false;
    const recovered = await fetch(origin);
    expect(recovered.status).toBe(200);
    expect(await recovered.text()).toBe('page');
  });
});

test('maintenance storage failure cannot silently expose the public page', async () => {
  await serve({
    getCachedCoreToken: async () => 'fixture-token',
    motherEmitter: { emit: (_event, _payload, cb) => {
      setImmediate(() => cb(Object.assign(new Error('locked'), { code: 'SQLITE_BUSY' })));
      return true;
    } }
  }, async origin => {
    expect((await fetch(origin)).status).toBe(503);
    expect((await fetch(`${origin}/admin/login`)).status).toBe(200);
  });
});

test('disabled maintenance performs only the needed lookup and enabled maintenance preserves its redirect', async () => {
  let enabled = false;
  const calls = [];
  await serve({
    getCachedCoreToken: async () => 'fixture-token',
    motherEmitter: { emit: (_event, payload, cb) => {
      calls.push(payload.key);
      cb(null, payload.key === 'MAINTENANCE_MODE' ? String(enabled) : null);
      return true;
    } }
  }, async origin => {
    expect((await fetch(origin)).status).toBe(200);
    expect(calls).toEqual(['MAINTENANCE_MODE']);
    enabled = true;
    const redirect = await fetch(origin, { redirect: 'manual' });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('location')).toBe('/coming-soon');
    expect((await fetch(`${origin}/coming-soon`)).status).toBe(200);
  });
});
