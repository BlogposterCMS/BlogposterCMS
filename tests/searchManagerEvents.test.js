const assert = require('assert');
const EventEmitter = require('events');

const { setupSearchEvents, _internals } = require('../mother/modules/searchManager');

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

test('indexSearchDocument normalizes entry sources and text', async () => {
  const emitter = new EventEmitter();
  setupSearchEvents(emitter);

  let dbPayload = null;
  emitter.on('dbUpdate', (payload, cb) => {
    dbPayload = payload;
    cb(null, { id: 1, ...payload.data.params });
  });

  const { err, result } = await emitAsync(emitter, 'indexSearchDocument', {
    jwt: 't',
    moduleName: 'searchManager',
    moduleType: 'core',
    decodedJWT: { permissions: { search: { manage: true } } },
    entryId: 7,
    contentTypeKey: 'post',
    title: 'Hello',
    body: '<h1>Hello</h1><script>bad()</script> body',
    url: 'post/hello',
    status: 'published',
    meta: {
      section: 'blog',
      __proto__: { polluted: true },
      nested: { constructor: { prototype: { bad: true } }, keep: 'yes' }
    }
  });

  assert.ifError(err);
  assert.strictEqual(dbPayload.data.rawSQL, 'UPSERT_SEARCH_DOCUMENT');
  assert.strictEqual(dbPayload.data.params.sourceModule, 'contentEngine');
  assert.strictEqual(dbPayload.data.params.sourceId, '7');
  assert.strictEqual(dbPayload.data.params.url, '/post/hello');
  assert.strictEqual(dbPayload.data.params.visibility, 'public');
  assert.deepStrictEqual(dbPayload.data.params.meta, {
    section: 'blog',
    nested: { keep: 'yes' }
  });
  assert.strictEqual({}.polluted, undefined);
  assert.match(dbPayload.data.params.searchText, /Hello body/);
  assert.strictEqual(result.contentTypeKey, 'post');
});

test('searchDocuments limits non-managers to public published documents', async () => {
  const emitter = new EventEmitter();
  setupSearchEvents(emitter);

  let dbPayload = null;
  emitter.on('dbSelect', (payload, cb) => {
    dbPayload = payload;
    cb(null, []);
  });

  const { err } = await emitAsync(emitter, 'searchDocuments', {
    jwt: 't',
    moduleName: 'searchManager',
    moduleType: 'core',
    decodedJWT: { permissions: { search: { view: true } } },
    query: 'hello',
    status: 'draft',
    visibility: 'private'
  });

  assert.ifError(err);
  assert.strictEqual(dbPayload.data.rawSQL, 'SEARCH_DOCUMENTS');
  assert.strictEqual(dbPayload.data.params.status, 'published');
  assert.strictEqual(dbPayload.data.params.visibility, 'public');
});

test('reindexContentEntries indexes Content Engine entries', async () => {
  const emitter = new EventEmitter();
  setupSearchEvents(emitter);

  const updates = [];
  emitter.on('listContentEntries', (_payload, cb) => {
    cb(null, [{
      id: 3,
      content_type_key: 'post',
      title: 'Indexed',
      excerpt: 'Short',
      permalink: '/post/indexed',
      language: 'en',
      status: 'published',
      content: { body: '<p>Body</p>' },
      meta: {}
    }]);
  });
  emitter.on('dbUpdate', (payload, cb) => {
    updates.push(payload);
    cb(null, { id: 1, ...payload.data.params });
  });

  const { err, result } = await emitAsync(emitter, 'reindexContentEntries', {
    jwt: 't',
    moduleName: 'searchManager',
    moduleType: 'core',
    decodedJWT: { permissions: { search: { manage: true } } }
  });

  assert.ifError(err);
  assert.strictEqual(result.count, 1);
  assert.strictEqual(updates[0].data.rawSQL, 'UPSERT_SEARCH_DOCUMENT');
  assert.strictEqual(updates[0].data.params.entryId, '3');
  assert.match(updates[0].data.params.searchText, /Indexed Short Body/);
});

test('search internals convert content entries to search documents', () => {
  const doc = _internals.contentEntryToSearchDocument({
    id: 4,
    content_type_key: 'page',
    title: 'About',
    permalink: '/about',
    status: 'published',
    content: { html: '<p>Team</p>' },
    meta: { metaDesc: 'About us' }
  });

  assert.strictEqual(doc.sourceModule, 'contentEngine');
  assert.strictEqual(doc.sourceId, '4');
  assert.strictEqual(doc.visibility, 'public');
  assert.match(doc.searchText, /About About us Team/);
});

test('search internals strip unsafe urls and sanitize metadata', () => {
  const unsafe = _internals.normalizeSearchDocument({
    sourceModule: 'legacy',
    sourceId: '1',
    title: 'Unsafe',
    url: 'javascript:alert(1)',
    meta: {
      ok: true,
      constructor: { prototype: { polluted: true } },
      list: ['x', () => 'bad']
    }
  });

  assert.strictEqual(unsafe.url, '');
  assert.deepStrictEqual(unsafe.meta, { ok: true, list: ['x', null] });
  assert.strictEqual({}.polluted, undefined);

  assert.strictEqual(_internals.normalizeSearchUrl('ftp://example.test/file'), '');
  assert.strictEqual(_internals.normalizeSearchUrl('java\nscript:alert(1)'), '');
  assert.strictEqual(_internals.normalizeSearchUrl('//example.test/file'), '');
  assert.strictEqual(_internals.normalizeSearchUrl('media/item'), '/media/item');
  assert.strictEqual(_internals.normalizeSearchUrl('https://example.test/item'), 'https://example.test/item');
});
