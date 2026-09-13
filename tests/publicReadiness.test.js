const { EventEmitter } = require('node:events');
const { createPublicReadiness } = require('../mother/server/health/publicReadiness');
const { BACKEND_EVENTS } = require('../mother/contracts/generatedBackendEventCatalog');

function fixture() {
  const emitter = new EventEmitter();
  let clock = 0;
  emitter.on(BACKEND_EVENTS.ENSURE_PUBLIC_TOKEN, (_payload, cb) => cb(null, 'public-token'));
  return { emitter, advance: () => { clock += 1001; }, check: createPublicReadiness({ motherEmitter: emitter, now: () => clock }) };
}

test('readiness reads the public facade, permits an empty site and coalesces simultaneous probes', async () => {
  const { emitter, check, advance } = fixture();
  let reply;
  const handler = jest.fn((payload, cb) => {
    expect(payload).toMatchObject({ jwt: 'public-token', resource: 'pages', action: 'start' });
    reply = () => cb(null, { resource: 'pages', action: 'start', eventName: 'getStartPage', data: null });
  });
  emitter.on(BACKEND_EVENTS.CMS_PUBLIC_RUNTIME_REQUEST, handler);
  const checks = [check(), check(), check()];
  await Promise.resolve();
  reply();
  expect(await Promise.all(checks)).toEqual([{ ready: true }, { ready: true }, { ready: true }]);
  expect(handler).toHaveBeenCalledTimes(1);
  expect(await check()).toEqual({ ready: true });
  advance();
  const next = check();
  await Promise.resolve();
  reply();
  await next;
  expect(handler).toHaveBeenCalledTimes(2);
});

test('an expired internal token or database failure replaces previous success with bounded failure', async () => {
  const { emitter, check, advance } = fixture();
  let fail = false;
  emitter.on(BACKEND_EVENTS.CMS_PUBLIC_RUNTIME_REQUEST, (_payload, cb) => {
    if (fail) cb(new Error('jwt expired with private details'));
    else cb(null, { resource: 'pages', action: 'start', eventName: 'getStartPage', data: null });
  });
  expect(await check()).toEqual({ ready: true });
  fail = true;
  advance();
  expect(await check()).toEqual({ ready: false, code: 'BLOGPOSTER_PUBLIC_RUNTIME_UNAVAILABLE' });
});

test('a nonresponsive dependency times out instead of hanging readiness', async () => {
  const { emitter, check } = fixture();
  emitter.on(BACKEND_EVENTS.CMS_PUBLIC_RUNTIME_REQUEST, () => {});
  expect(await check()).toEqual({ ready: false, code: 'BLOGPOSTER_PUBLIC_RUNTIME_UNAVAILABLE' });
});
