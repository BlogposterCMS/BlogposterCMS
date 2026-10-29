'use strict';

const express = require('express');
const servers = new Map();
afterEach(async () => {
  await Promise.all([...servers.values()].map(server => new Promise(resolve => {
    server.close(resolve); server.closeAllConnections();
  })));
  servers.clear();
});
async function get(app, route, status = 200) {
  if (!servers.has(app)) {
    const server = await new Promise(resolve => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    servers.set(app, server);
  }
  const response = await fetch(`http://127.0.0.1:${servers.get(app).address().port}${route}`);
  expect(response.status).toBe(status);
  const text = await response.text();
  const body = response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : null;
  return { body, text, headers: Object.fromEntries(response.headers) };
}
const { EventEmitter } = require('events');
const { createCoreModuleLifecycle } = require('../mother/server/bootstrap/coreModuleLifecycle');

function implementation(version, handler) {
  return { lifecycleVersion: 1, httpLifecycleVersion: 1,
    initialize({ app }) {
      app.get('/owned', handler || ((_req, res) => res.json({ version })));
    } };
}

test('switches owned routes without replacing host middleware or adding mounts', async () => {
  const app = express();
  const lifecycle = createCoreModuleLifecycle(new EventEmitter());
  app.use((_req, res, next) => { res.setHeader('X-Host-Guard', 'retained'); next(); });
  await lifecycle.start('httpModule', implementation('old'), { app });
  const mounts = app._router.stack.length;
  await lifecycle.replace('httpModule', implementation('new'), { healthCheck: async () => {} });
  const result = await get(app, '/owned');
  expect(result.body.version).toBe('new');
  expect(result.headers['x-host-guard']).toBe('retained');
  expect(app._router.stack).toHaveLength(mounts);
});

test('failed readiness restores old routes and a changed route surface cannot activate', async () => {
  const app = express();
  const lifecycle = createCoreModuleLifecycle(new EventEmitter());
  await lifecycle.start('httpModule', implementation('old'), { app });
  await expect(lifecycle.replace('httpModule', implementation('new'), {
    healthCheck: async () => { throw new Error('unhealthy'); }
  })).rejects.toThrow('unhealthy');
  await expect(lifecycle.replace('httpModule', { lifecycleVersion: 1, httpLifecycleVersion: 1,
    initialize({ app: router }) { router.get('/different', (_req, res) => res.end()); }
  }, { healthCheck: async () => {} })).rejects.toMatchObject({ code: 'CORE_MODULE_HTTP_SURFACE_CHANGED' });
  expect((await get(app, '/owned')).body.version).toBe('old');
});

test('waits for an active response and asynchronous work while unrelated routes remain usable', async () => {
  const app = express();
  const lifecycle = createCoreModuleLifecycle(new EventEmitter());
  let finish;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const work = new Promise(resolve => { finish = resolve; });
  await lifecycle.start('httpModule', implementation('old', async (_req, res) => {
    res.json({ version: 'old' });
    started();
    await work;
  }), { app });
  app.get('/other', (_req, res) => res.send('available'));
  const old = get(app, '/owned').then(response => response);
  await ready;
  const replacing = lifecycle.replace('httpModule', implementation('new'), { healthCheck: async () => {} });
  expect(lifecycle.snapshot()[0].state).toBe('draining');
  expect((await get(app, '/other')).text).toBe('available');
  await get(app, '/owned', 503);
  finish();
  await replacing;
  expect((await old).body.version).toBe('old');
  expect((await get(app, '/owned')).body.version).toBe('new');
});

test('an admitted middleware chain can finish after draining begins', async () => {
  const app = express();
  const lifecycle = createCoreModuleLifecycle(new EventEmitter());
  let continueRequest;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  await lifecycle.start('httpModule', { lifecycleVersion: 1, httpLifecycleVersion: 1,
    initialize({ app: router }) {
      router.get('/owned', (_req, _res, next) => { continueRequest = next; started(); },
        (_req, res) => res.send('finished'));
    }
  }, { app });
  const response = get(app, '/owned').then(result => result);
  await ready;
  const replacing = lifecycle.replace('httpModule', implementation('new'), { healthCheck: async () => {} });
  continueRequest();
  expect((await response).text).toBe('finished');
  await replacing;
});
