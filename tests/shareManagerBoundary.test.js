const assert = require('assert');
const EventEmitter = require('events');

const shareManager = require('../mother/modules/shareManager');

function emitAsync(emitter, eventName, payload) {
  return new Promise((resolve) => {
    emitter.emit(eventName, payload, (err, result) => {
      resolve({ err, result });
    });
  });
}

function sharePayload(overrides = {}) {
  return {
    jwt: 'share-token',
    moduleName: 'shareManager',
    moduleType: 'core',
    userId: 'user-1',
    ...overrides
  };
}

test('share manager createShareLink requires shareManager core scope', async () => {
  const emitter = new EventEmitter();
  shareManager._internals.setupShareEventListeners(emitter);

  const result = await emitAsync(emitter, 'createShareLink', {
    jwt: 'share-token',
    moduleName: 'demoModule',
    moduleType: 'community',
    userId: 'user-1',
    filePath: 'public/hero.png'
  });

  assert(result.err);
  assert.match(result.err.message, /requires shareManager core scope/);
});

test('share manager normalizes share file paths before storage', async () => {
  const emitter = new EventEmitter();
  shareManager._internals.setupShareEventListeners(emitter);
  const oldBase = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = 'https://blogposter.test';
  let insertedPayload = null;

  emitter.on('dbInsert', (payload, cb) => {
    insertedPayload = payload;
    cb(null, { inserted: true });
  });

  try {
    const result = await emitAsync(emitter, 'createShareLink', sharePayload({
      filePath: 'public\\folder\\hero.png?download=1',
      isPublic: false,
      expiresAt: '2030-01-02T03:04:05.000Z'
    }));

    assert.ifError(result.err);
    assert(insertedPayload);
    assert.strictEqual(insertedPayload.moduleName, 'shareManager');
    assert.strictEqual(insertedPayload.moduleType, 'core');
    assert.strictEqual(insertedPayload.data.rawSQL, 'CREATE_SHARE_LINK');
    assert.strictEqual(insertedPayload.data.filePath, 'public/folder/hero.png');
    assert.strictEqual(insertedPayload.data.isPublic, false);
    assert.strictEqual(insertedPayload.data.expiresAt, '2030-01-02T03:04:05.000Z');
    assert.match(result.result.shortToken, /^[A-Za-z0-9]{8}$/);
    assert.strictEqual(result.result.shareURL, `https://blogposter.test/s/${result.result.shortToken}/hero.png`);
  } finally {
    if (typeof oldBase === 'undefined') delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = oldBase;
  }
});

test('share manager rejects unsafe share file paths', async () => {
  const unsafePaths = [
    '../secret.txt',
    'folder/../secret.txt',
    'C:\\secret.txt',
    'https://evil.test/asset.png',
    '//server/share.png',
    'folder/\u0000secret.txt'
  ];

  for (const filePath of unsafePaths) {
    const emitter = new EventEmitter();
    shareManager._internals.setupShareEventListeners(emitter);
    let inserted = false;
    emitter.on('dbInsert', (_payload, cb) => {
      inserted = true;
      cb(null, {});
    });

    const result = await emitAsync(emitter, 'createShareLink', sharePayload({ filePath }));
    assert(result.err, `expected ${filePath} to be rejected`);
    assert.match(result.err.message, /Invalid share filePath/);
    assert.strictEqual(inserted, false);
  }
});

test('share manager validates short tokens for read and revoke events', async () => {
  const emitter = new EventEmitter();
  shareManager._internals.setupShareEventListeners(emitter);
  let selectedPayload = null;
  let updatedPayload = null;

  emitter.on('dbSelect', (payload, cb) => {
    selectedPayload = payload;
    cb(null, [{ shortToken: payload.data.shortToken, filePath: 'public/hero.png' }]);
  });
  emitter.on('dbUpdate', (payload, cb) => {
    updatedPayload = payload;
    cb(null, { revoked: true });
  });

  const badRead = await emitAsync(emitter, 'getShareDetails', sharePayload({
    shortToken: 'abc/123'
  }));
  assert(badRead.err);
  assert.match(badRead.err.message, /Invalid shortToken/);

  const read = await emitAsync(emitter, 'getShareDetails', sharePayload({
    shortToken: ' abc_123 '
  }));
  assert.ifError(read.err);
  assert.strictEqual(selectedPayload.data.shortToken, 'abc_123');

  const badRevoke = await emitAsync(emitter, 'revokeShareLink', sharePayload({
    shortToken: '../abc'
  }));
  assert(badRevoke.err);
  assert.match(badRevoke.err.message, /Invalid shortToken/);

  const revoke = await emitAsync(emitter, 'revokeShareLink', sharePayload({
    shortToken: 'abc-123'
  }));
  assert.ifError(revoke.err);
  assert.strictEqual(updatedPayload.data.shortToken, 'abc-123');
});
