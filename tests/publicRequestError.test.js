const express = require('express');
const { publicRequestError } = require('../mother/server/http/publicRequestError');

test('unexpected and nested dependency errors stay bounded and cannot poison later HTTP requests', async () => {
  const app = express();
  app.get('/fault', (_req, _res, next) => next(new Error('private provider payload')));
  app.get('/timeout', (_req, _res, next) => next(Object.assign(new Error('outer private data'), {
    cause: Object.assign(new Error('inner private data'), { code: 'EVENT_CONTRACT_TIMEOUT' })
  })));
  app.get('/ok', (_req, res) => res.send('ok'));
  app.use(publicRequestError);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const failed = await fetch(`${origin}/fault`);
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toMatch(/private|Error:| at /);
    const timeout = await fetch(`${origin}/timeout`);
    expect(timeout.status).toBe(503);
    expect(timeout.headers.get('retry-after')).toBe('30');
    expect(timeout.headers.get('cache-control')).toBe('no-store');
    expect(await timeout.text()).not.toContain('private');
    expect(await (await fetch(`${origin}/ok`)).text()).toBe('ok');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('a response already sent delegates termination to Express instead of writing twice', () => {
  const next = jest.fn();
  const error = new Error('after headers');
  publicRequestError(error, {}, { headersSent: true }, next);
  expect(next).toHaveBeenCalledWith(error);
});
