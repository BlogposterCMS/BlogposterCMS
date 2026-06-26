const assert = require('assert');
const EventEmitter = require('events');

const { setupRedirectEvents, _internals } = require('../mother/modules/redirectManager');

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

test('upsertRedirectRule normalizes source paths and targets', async () => {
  const emitter = new EventEmitter();
  setupRedirectEvents(emitter);

  let dbPayload = null;
  emitter.on('dbUpdate', (payload, cb) => {
    dbPayload = payload;
    cb(null, { id: 1, ...payload.data.params });
  });

  const { err, result } = await emitAsync(emitter, 'upsertRedirectRule', {
    jwt: 't',
    moduleName: 'redirectManager',
    moduleType: 'core',
    decodedJWT: { permissions: { redirects: { manage: true } } },
    fromPath: 'https://old.example/About/?preview=1#top',
    toPath: 'new-home',
    statusCode: 302,
    matchType: 'prefix',
    language: 'EN',
    meta: JSON.parse('{"safe":"yes","__proto__":{"polluted":true},"nested":{"constructor":"drop","keep":true}}')
  });

  assert.ifError(err);
  assert.strictEqual(dbPayload.data.rawSQL, 'UPSERT_REDIRECT_RULE');
  assert.strictEqual(dbPayload.data.params.fromPath, '/About');
  assert.strictEqual(dbPayload.data.params.toPath, '/new-home');
  assert.strictEqual(dbPayload.data.params.statusCode, 302);
  assert.strictEqual(dbPayload.data.params.matchType, 'prefix');
  assert.strictEqual(dbPayload.data.params.language, 'en');
  assert.deepStrictEqual(dbPayload.data.params.meta, {
    safe: 'yes',
    nested: { keep: true }
  });
  assert.strictEqual(result.active, true);
  assert.strictEqual({}.polluted, undefined);
});

test('upsertRedirectRule rejects unsafe targets', async () => {
  const emitter = new EventEmitter();
  setupRedirectEvents(emitter);

  const { err } = await emitAsync(emitter, 'upsertRedirectRule', {
    jwt: 't',
    moduleName: 'redirectManager',
    moduleType: 'core',
    decodedJWT: { permissions: { redirects: { manage: true } } },
    fromPath: '/old',
    toPath: 'javascript:alert(1)'
  });

  assert(err);
  assert.match(err.message, /Unsafe redirect target/);

  const unsafeWhitespace = await emitAsync(emitter, 'upsertRedirectRule', {
    jwt: 't',
    moduleName: 'redirectManager',
    moduleType: 'core',
    decodedJWT: { permissions: { redirects: { manage: true } } },
    fromPath: '/old',
    toPath: 'https://example.test/new path'
  });
  assert(unsafeWhitespace.err);
  assert.match(unsafeWhitespace.err.message, /Unsafe redirect target/);
});

test('resolveRedirect matches prefix rules and records hits', async () => {
  const emitter = new EventEmitter();
  setupRedirectEvents(emitter);

  const updates = [];
  emitter.on('dbSelect', (payload, cb) => {
    assert.strictEqual(payload.data.rawSQL, 'RESOLVE_REDIRECT');
    cb(null, [{
      id: 5,
      from_path: '/old',
      to_path: '/new',
      status_code: 308,
      match_type: 'prefix',
      priority: 10,
      language: '',
      active: true,
      meta: '{"safe":"yes","constructor":"drop"}'
    }]);
  });
  emitter.on('dbUpdate', (payload, cb) => {
    updates.push(payload);
    cb(null, { done: true });
  });

  const { err, result } = await emitAsync(emitter, 'resolveRedirect', {
    jwt: 't',
    moduleName: 'redirectManager',
    moduleType: 'core',
    path: '/old/team',
    userAgent: 'Mozilla test',
    referer: 'https://example.test'
  });

  assert.ifError(err);
  assert.strictEqual(result.ruleId, 5);
  assert.strictEqual(result.target, '/new/team');
  assert.strictEqual(result.statusCode, 308);
  assert.deepStrictEqual(result.meta, { safe: 'yes' });
  assert.strictEqual(updates[0].data.rawSQL, 'RECORD_REDIRECT_HIT');
  assert.strictEqual(updates[0].data.params.ruleId, 5);
  assert.strictEqual(updates[0].data.params.fromPath, '/old/team');
  assert.match(updates[0].data.params.userAgentHash, /^[a-f0-9]{64}$/);
});

test('listRedirectRules requires redirect management permission', async () => {
  const emitter = new EventEmitter();
  setupRedirectEvents(emitter);

  const { err } = await emitAsync(emitter, 'listRedirectRules', {
    jwt: 't',
    moduleName: 'redirectManager',
    moduleType: 'core',
    decodedJWT: { permissions: { redirects: { view: true } } }
  });

  assert(err);
  assert.match(err.message, /redirects\.manage/);
});

test('redirect internals support regex replacements and target normalization', () => {
  const rule = _internals.normalizeRedirectRule({
    fromPath: '^/old/(.*)$',
    toPath: '/new/$1',
    matchType: 'regex'
  });
  assert.strictEqual(_internals.ruleMatches({ from_path: rule.fromPath, match_type: 'regex' }, '/old/team'), true);
  assert.strictEqual(_internals.buildRedirectTarget({
    from_path: rule.fromPath,
    to_path: rule.toPath,
    match_type: 'regex',
    meta: {}
  }, '/old/team'), '/new/team');
  assert.strictEqual(_internals.normalizeRedirectTarget('https://example.test/a'), 'https://example.test/a');
});
