const express = require('express');
const { createHealthRoutes } = require('../mother/server/http/healthRoutes');

async function withServer(router, callback) {
  const app = express();
  app.use(router);
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    const address = server.address();
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('health routes expose bounded liveness and readiness metadata', async () => {
  await withServer(createHealthRoutes({ version: '1.2.3' }), async origin => {
    const live = await fetch(`${origin}/health/live`);
    const ready = await fetch(`${origin}/health/ready`);

    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({
      code: 'BLOGPOSTER_LIVE', status: 'live', version: '1.2.3'
    });
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({
      code: 'BLOGPOSTER_READY', status: 'ready', version: '1.2.3'
    });
    expect(ready.headers.get('cache-control')).toBe('no-store');
  });
});

test('readiness fails closed without exposing the thrown error', async () => {
  await withServer(createHealthRoutes({
    version: '1.2.3',
    readiness: async () => { throw new Error('database password secret'); }
  }), async origin => {
    const response = await fetch(`${origin}/health/ready`);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      code: 'BLOGPOSTER_READINESS_FAILED', status: 'not-ready', version: '1.2.3'
    });
    expect(JSON.stringify(body)).not.toContain('database password');
  });
});
