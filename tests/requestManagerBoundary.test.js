const assert = require('assert');
const EventEmitter = require('events');

jest.mock('axios', () => jest.fn());

const axios = require('axios');
const requestManager = require('../mother/modules/requestManager');

beforeEach(() => {
  axios.mockReset();
});

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => {
      resolve({ err, result });
    });
  });
}

test('request manager rejects registered community modules even when payload spoofs core', async () => {
  const emitter = new EventEmitter();
  emitter._moduleTypes = { news: 'community' };
  await requestManager.initialize({ motherEmitter: emitter, isCore: true });

  const { err } = await emitAsync(emitter, 'httpRequest', {
    jwt: 'token',
    moduleName: 'news',
    moduleType: 'core',
    url: 'https://example.test/feed'
  });

  assert(err);
  assert.match(err.message, /Community module "news" cannot use/);
  assert.strictEqual(axios.mock.calls.length, 0);
});

test('request manager requires a scoped jwt for outbound requests', async () => {
  const emitter = new EventEmitter();
  emitter._moduleTypes = { news: 'core' };
  await requestManager.initialize({ motherEmitter: emitter, isCore: true });

  const { err } = await emitAsync(emitter, 'httpRequest', {
    moduleName: 'news',
    moduleType: 'core',
    url: 'https://example.test/feed'
  });

  assert(err);
  assert.match(err.message, /requires a jwt/);
  assert.strictEqual(axios.mock.calls.length, 0);
});

test('request manager accepts allowlisted core outbound requests', async () => {
  const previousAllowedHosts = process.env.REQUEST_MANAGER_ALLOWED_HOSTS;
  process.env.REQUEST_MANAGER_ALLOWED_HOSTS = 'example.test';
  axios.mockResolvedValueOnce({ status: 200, data: { ok: true } });

  try {
    const emitter = new EventEmitter();
    emitter._moduleTypes = { news: 'core' };
    await requestManager.initialize({ motherEmitter: emitter, isCore: true });

    const { err, result } = await emitAsync(emitter, 'httpRequest', {
      jwt: 'token',
      moduleName: 'news',
      moduleType: 'core',
      url: 'https://example.test/feed',
      method: 'GET'
    });

    assert.ifError(err);
    assert.deepStrictEqual(result, { status: 200, data: { ok: true } });
    assert.strictEqual(axios.mock.calls[0][0].method, 'get');
  } finally {
    if (previousAllowedHosts === undefined) {
      delete process.env.REQUEST_MANAGER_ALLOWED_HOSTS;
    } else {
      process.env.REQUEST_MANAGER_ALLOWED_HOSTS = previousAllowedHosts;
    }
  }
});

test('request manager rejects outbound hosts outside the allowlist', async () => {
  const previousAllowedHosts = process.env.REQUEST_MANAGER_ALLOWED_HOSTS;
  process.env.REQUEST_MANAGER_ALLOWED_HOSTS = 'api.example.test';

  try {
    const emitter = new EventEmitter();
    emitter._moduleTypes = { news: 'core' };
    await requestManager.initialize({ motherEmitter: emitter, isCore: true });

    const { err } = await emitAsync(emitter, 'httpRequest', {
      jwt: 'token',
      moduleName: 'news',
      moduleType: 'core',
      url: 'https://other.example.test/feed'
    });

    assert(err);
    assert.match(err.message, /not allowed/);
    assert.strictEqual(axios.mock.calls.length, 0);
  } finally {
    if (previousAllowedHosts === undefined) {
      delete process.env.REQUEST_MANAGER_ALLOWED_HOSTS;
    } else {
      process.env.REQUEST_MANAGER_ALLOWED_HOSTS = previousAllowedHosts;
    }
  }
});
