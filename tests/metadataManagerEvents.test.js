const assert = require('assert');
const EventEmitter = require('events');

const { setupMetadataEvents, _internals } = require('../mother/modules/metadataManager');

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

test('registerMetaField normalizes custom field definitions', async () => {
  const emitter = new EventEmitter();
  setupMetadataEvents(emitter);

  let dbPayload = null;
  emitter.on('dbUpdate', (payload, cb) => {
    dbPayload = payload;
    cb(null, { id: 1, ...payload.data.params });
  });

  const { err, result } = await emitAsync(emitter, 'registerMetaField', {
    jwt: 't',
    moduleName: 'metadataManager',
    moduleType: 'core',
    decodedJWT: { permissions: { metadata: { manage: true } } },
    targetType: 'entry',
    metaKey: 'Hero Subtitle',
    label: 'Hero Subtitle',
    valueType: 'text',
    defaultValue: 'Fallback',
    public: true,
    searchable: true
  });

  assert.ifError(err);
  assert.strictEqual(dbPayload.data.rawSQL, 'UPSERT_META_FIELD');
  assert.strictEqual(dbPayload.data.params.targetType, 'contentEntry');
  assert.strictEqual(dbPayload.data.params.metaKey, 'hero-subtitle');
  assert.strictEqual(dbPayload.data.params.valueType, 'text');
  assert.strictEqual(dbPayload.data.params.public, true);
  assert.strictEqual(result.defaultValue, 'Fallback');
});

test('setMetadata loads field definitions and coerces values', async () => {
  const emitter = new EventEmitter();
  setupMetadataEvents(emitter);

  const updates = [];
  emitter.on('dbSelect', (payload, cb) => {
    assert.strictEqual(payload.data.rawSQL, 'GET_META_FIELD');
    assert.strictEqual(payload.data.params.targetType, 'contentEntry');
    cb(null, { target_type: 'contentEntry', meta_key: 'reading-time', value_type: 'number', public: true });
  });
  emitter.on('dbUpdate', (payload, cb) => {
    updates.push(payload);
    cb(null, { id: 2, ...payload.data.params });
  });

  const { err, result } = await emitAsync(emitter, 'setMetadata', {
    jwt: 't',
    moduleName: 'metadataManager',
    moduleType: 'core',
    decodedJWT: { permissions: { metadata: { manage: true } } },
    entryId: 44,
    metaKey: 'Reading Time',
    value: '7'
  });

  assert.ifError(err);
  assert.strictEqual(updates[0].data.rawSQL, 'UPSERT_METADATA_VALUE');
  assert.strictEqual(updates[0].data.params.targetType, 'contentEntry');
  assert.strictEqual(updates[0].data.params.targetId, '44');
  assert.strictEqual(updates[0].data.params.metaKey, 'reading-time');
  assert.strictEqual(updates[0].data.params.value, 7);
  assert.strictEqual(updates[0].data.params.visibility, 'public');
  assert.strictEqual(result.value, 7);
});

test('getMetadata applies public visibility for non-managers', async () => {
  const emitter = new EventEmitter();
  setupMetadataEvents(emitter);

  let dbPayload = null;
  emitter.on('dbSelect', (payload, cb) => {
    dbPayload = payload;
    cb(null, [{ value: '"Public"', value_type: 'string', meta_key: 'subtitle' }]);
  });

  const { err, result } = await emitAsync(emitter, 'getMetadata', {
    jwt: 't',
    moduleName: 'metadataManager',
    moduleType: 'core',
    decodedJWT: { permissions: { metadata: { view: true } } },
    entryId: 9,
    visibility: 'private'
  });

  assert.ifError(err);
  assert.strictEqual(dbPayload.data.rawSQL, 'GET_METADATA_VALUES');
  assert.strictEqual(dbPayload.data.params.targetType, 'contentEntry');
  assert.strictEqual(dbPayload.data.params.visibility, 'public');
  assert.strictEqual(result[0].value, 'Public');
});

test('manager listMetaFields can list all fields without public filter', async () => {
  const emitter = new EventEmitter();
  setupMetadataEvents(emitter);

  let dbPayload = null;
  emitter.on('dbSelect', (payload, cb) => {
    dbPayload = payload;
    cb(null, []);
  });

  const { err } = await emitAsync(emitter, 'listMetaFields', {
    jwt: 't',
    moduleName: 'metadataManager',
    moduleType: 'core',
    decodedJWT: { permissions: { metadata: { manage: true } } },
    targetType: 'media'
  });

  assert.ifError(err);
  assert.strictEqual(dbPayload.data.rawSQL, 'LIST_META_FIELDS');
  assert.strictEqual(dbPayload.data.params.targetType, 'mediaAttachment');
  assert.strictEqual(dbPayload.data.params.public, null);
});

test('metadata internals coerce values and reject unsafe URLs', () => {
  assert.strictEqual(_internals.coerceValue('true', 'boolean'), true);
  assert.strictEqual(_internals.coerceValue('12', 'number'), 12);
  assert.deepStrictEqual(_internals.coerceValue('{"a":1}', 'json'), { a: 1 });
  assert.throws(() => _internals.coerceValue('javascript:alert(1)', 'url'), /unsafe/);
  assert.throws(() => _internals.coerceValue('ftp://example.test/file', 'url'), /unsafe/);
  assert.throws(() => _internals.coerceValue('java\nscript:alert(1)', 'url'), /unsafe/);
  assert.throws(() => _internals.coerceValue('//example.test/file', 'url'), /unsafe/);
  assert.strictEqual(_internals.coerceValue('media/hero.png', 'url'), '/media/hero.png');
  assert.strictEqual(_internals.coerceValue('/media/hero.png', 'url'), '/media/hero.png');
  assert.strictEqual(_internals.coerceValue('https://example.test/hero.png', 'url'), 'https://example.test/hero.png');
  assert.deepStrictEqual(_internals.normalizeTarget({ sourceModule: 'pagesManager', sourceId: 7 }), {
    targetType: 'source',
    targetId: 'pagesManager:7'
  });
});

test('metadata internals sanitize json values and meta objects', () => {
  const clean = _internals.coerceValue(
    '{"safe":1,"__proto__":{"polluted":true},"constructor":{"prototype":{"bad":true}}}',
    'json'
  );

  assert.deepStrictEqual(clean, { safe: 1 });
  assert.strictEqual({}.polluted, undefined);

  const normalized = _internals.normalizeMetadataValue({
    targetType: 'global',
    targetId: 'default',
    metaKey: 'Layout Options',
    valueType: 'json',
    value: {
      ok: true,
      nested: { prototype: { bad: true }, keep: 'yes' },
      skip: () => 'no'
    },
    meta: {
      constructor: { prototype: { polluted: true } },
      source: 'test'
    }
  });

  assert.deepStrictEqual(normalized.value, {
    ok: true,
    nested: { keep: 'yes' },
    skip: null
  });
  assert.deepStrictEqual(normalized.meta, { source: 'test' });

  const parsed = _internals.parseRecordValue({
    value_type: 'json',
    value: '{"__proto__":{"polluted":true},"visible":true}'
  });
  assert.deepStrictEqual(parsed.value, { visible: true });
  assert.strictEqual({}.polluted, undefined);
});
