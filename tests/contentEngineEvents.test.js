const EventEmitter = require('events');
const {
  setupContentEngineEvents,
  _internals,
} = require('../mother/modules/contentEngine');

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

test('buildPermalink keeps pages at root and posts below their type', () => {
  expect(_internals.buildPermalink({ contentTypeKey: 'page', slug: 'About Us' })).toBe('/about-us');
  expect(_internals.buildPermalink({ contentTypeKey: 'post', slug: 'Launch Notes' })).toBe('/post/launch-notes');
  expect(_internals.buildPermalink({ contentTypeKey: 'page', slug: 'team', parentPermalink: '/about' })).toBe('/about/team');
});

test('buildPermalink keeps content paths internal and slug based', () => {
  expect(_internals.buildPermalink({
    contentTypeKey: 'post',
    slug: 'Launch Notes',
    permalink: '/News/Launch/?utm=tracking#top'
  })).toBe('/news/launch');
  expect(_internals.buildPermalink({
    contentTypeKey: 'post',
    slug: 'Launch Notes',
    permalink: 'javascript:alert(1)'
  })).toBe('/post/launch-notes');
  expect(_internals.normalizePermalinkPath('//evil.test/news')).toBe('');
});

test('createContentEntry emits normalized CREATE_CONTENT_ENTRY placeholder', async () => {
  const emitter = new EventEmitter();
  setupContentEngineEvents(emitter);

  let dbPayload;
  emitter.on('dbUpdate', (payload, cb) => {
    dbPayload = payload;
    cb(null, {
      entryId: 42,
      revisionId: 7,
      version: 1,
      slug: payload.data.params.slug,
      permalink: payload.data.params.permalink,
    });
  });

  const content = JSON.parse('{"body":"First post","__proto__":{"polluted":true},"blocks":[{"constructor":"drop","type":"paragraph"}]}');
  content.helper = () => 'ignored';
  const { err, result } = await emitAsync(emitter, 'createContentEntry', {
    jwt: 'token',
    moduleName: 'contentEngine',
    moduleType: 'core',
    contentType: 'post',
    title: 'Hello World!',
    permalink: 'javascript:alert(1)',
    sourceModule: 'pagesManager',
    sourceId: 7,
    content,
    meta: JSON.parse('{"safe":"yes","prototype":"drop","nested":{"__proto__":{"x":true},"keep":1}}')
  });

  expect(err).toBeFalsy();
  expect(result).toEqual({
    entryId: 42,
    revisionId: 7,
    version: 1,
    slug: 'hello-world',
    permalink: '/post/hello-world',
  });
  expect(dbPayload).toEqual(expect.objectContaining({
    moduleName: 'contentEngine',
    moduleType: 'core',
    table: '__rawSQL__',
    data: expect.objectContaining({
      rawSQL: 'CREATE_CONTENT_ENTRY',
      params: expect.objectContaining({
        contentTypeKey: 'post',
        slug: 'hello-world',
        permalink: '/post/hello-world',
        status: 'draft',
        language: 'en',
        sourceModule: 'pagesManager',
        sourceId: '7',
        content: {
          body: 'First post',
          blocks: [{ type: 'paragraph' }],
          helper: null
        },
        meta: {
          safe: 'yes',
          nested: { keep: 1 }
        }
      }),
    }),
  }));
  expect({}.polluted).toBeUndefined();
});

test('registerContentType sanitizes fields and settings before persistence', async () => {
  const emitter = new EventEmitter();
  setupContentEngineEvents(emitter);

  let dbPayload;
  emitter.on('dbUpdate', (payload, cb) => {
    dbPayload = payload;
    cb(null, { ok: true });
  });

  const fields = JSON.parse('[{"name":"body","type":"richtext","constructor":"drop"},{"name":"seo","settings":{"__proto__":{"x":true},"visible":true}}]');
  const settings = JSON.parse('{"public":true,"__proto__":{"polluted":true},"ui":{"prototype":"drop","icon":"fileText"}}');
  const { err } = await emitAsync(emitter, 'registerContentType', {
    jwt: 'token',
    moduleName: 'contentEngine',
    moduleType: 'core',
    decodedJWT: { permissions: { content: { types: { manage: true } } } },
    key: 'Article Type',
    label: ' Article ',
    icon: 'fileText<script>',
    fields,
    settings
  });

  expect(err).toBeFalsy();
  expect(dbPayload.data.rawSQL).toBe('UPSERT_CONTENT_TYPE');
  expect(dbPayload.data.params).toEqual(expect.objectContaining({
    key: 'article-type',
    label: 'Article',
    icon: 'fileTextscript',
    fields: [
      { name: 'body', type: 'richtext' },
      { name: 'seo', settings: { visible: true } }
    ],
    settings: { public: true, ui: { icon: 'fileText' } }
  }));
});

test('createContentEntry rejects invalid module identity', async () => {
  const emitter = new EventEmitter();
  setupContentEngineEvents(emitter);

  const { err } = await emitAsync(emitter, 'createContentEntry', {
    jwt: 'token',
    moduleName: 'pagesManager',
    moduleType: 'core',
    title: 'Nope',
  });

  expect(err).toBeTruthy();
  expect(err.message).toMatch(/invalid meltdown payload/);
});

test('resolveContentPermalink rejects external or unsafe paths before querying', async () => {
  const emitter = new EventEmitter();
  setupContentEngineEvents(emitter);

  let selected = false;
  emitter.on('dbSelect', (_payload, cb) => {
    selected = true;
    cb(null, null);
  });

  const { err } = await emitAsync(emitter, 'resolveContentPermalink', {
    jwt: 'token',
    moduleName: 'contentEngine',
    moduleType: 'core',
    path: 'https://evil.test/post'
  });

  expect(err).toBeTruthy();
  expect(err.message).toMatch(/permalink or path is required/);
  expect(selected).toBe(false);
});

test('createContentEntry rejects duplicate permalinks before writing', async () => {
  const emitter = new EventEmitter();
  setupContentEngineEvents(emitter);

  let updateCalled = false;
  emitter.on('dbSelect', (payload, cb) => {
    if (payload.data.rawSQL === 'FIND_CONTENT_ENTRY_CONFLICT') {
      return cb(null, {
        id: 9,
        content_type_key: 'post',
        slug: 'hello-world',
        permalink: '/post/hello-world',
        language: 'en'
      });
    }
    cb(null, null);
  });
  emitter.on('dbUpdate', (_payload, cb) => {
    updateCalled = true;
    cb(null, {});
  });

  const { err } = await emitAsync(emitter, 'createContentEntry', {
    jwt: 'token',
    moduleName: 'contentEngine',
    moduleType: 'core',
    decodedJWT: { permissions: { content: { create: true } } },
    contentType: 'post',
    title: 'Hello World'
  });

  expect(err).toBeTruthy();
  expect(err.message).toMatch(/permalink already exists/);
  expect(updateCalled).toBe(false);
});

test('updateContentEntry allows its own slug but rejects another entry conflict', async () => {
  const emitter = new EventEmitter();
  setupContentEngineEvents(emitter);

  const updates = [];
  emitter.on('dbSelect', (payload, cb) => {
    if (payload.data.rawSQL === 'GET_CONTENT_ENTRY') {
      return cb(null, {
        id: 42,
        content_type_key: 'post',
        slug: 'hello-world',
        permalink: '/post/hello-world',
        status: 'draft',
        title: 'Hello World',
        language: 'en',
        content: {},
        meta: {}
      });
    }
    if (payload.data.rawSQL === 'FIND_CONTENT_ENTRY_CONFLICT') {
      return cb(null, { id: payload.data.params.slug === 'taken' ? 99 : 42, permalink: payload.data.params.permalink });
    }
    cb(null, null);
  });
  emitter.on('dbUpdate', (payload, cb) => {
    updates.push(payload);
    cb(null, { entryId: payload.data.params.id, revisionId: 3, version: 2 });
  });

  const ok = await emitAsync(emitter, 'updateContentEntry', {
    jwt: 'token',
    moduleName: 'contentEngine',
    moduleType: 'core',
    decodedJWT: { permissions: { content: { update: true } } },
    entryId: 42,
    title: 'Hello World'
  });
  expect(ok.err).toBeFalsy();
  expect(updates).toHaveLength(1);

  const conflict = await emitAsync(emitter, 'updateContentEntry', {
    jwt: 'token',
    moduleName: 'contentEngine',
    moduleType: 'core',
    decodedJWT: { permissions: { content: { update: true } } },
    entryId: 42,
    title: 'Taken',
    slug: 'taken'
  });
  expect(conflict.err).toBeTruthy();
  expect(conflict.err.message).toMatch(/permalink already exists|slug already exists/);
  expect(updates).toHaveLength(1);
});

test('content lifecycle events emit trash, restore and scheduled placeholders', async () => {
  const emitter = new EventEmitter();
  setupContentEngineEvents(emitter);

  const updates = [];
  const selects = [];
  emitter.on('dbUpdate', (payload, cb) => {
    updates.push(payload);
    cb(null, { ok: true, rawSQL: payload.data.rawSQL, params: payload.data.params });
  });
  emitter.on('dbSelect', (payload, cb) => {
    selects.push(payload);
    cb(null, []);
  });

  const base = {
    jwt: 'token',
    moduleName: 'contentEngine',
    moduleType: 'core',
    decodedJWT: {
      permissions: {
        content: {
          delete: true,
          restore: true,
          publish: true
        }
      }
    }
  };

  const trashed = await emitAsync(emitter, 'trashContentEntry', { ...base, entryId: 12 });
  expect(trashed.err).toBeFalsy();
  expect(updates[0].data.rawSQL).toBe('TRASH_CONTENT_ENTRY');
  expect(updates[0].data.params.entryId).toBe(12);

  const restored = await emitAsync(emitter, 'restoreContentEntry', { ...base, entryId: 12, status: 'deleted' });
  expect(restored.err).toBeFalsy();
  expect(updates[1].data.rawSQL).toBe('RESTORE_CONTENT_ENTRY');
  expect(updates[1].data.params.status).toBe('draft');

  const trashList = await emitAsync(emitter, 'listTrashedContentEntries', { ...base, contentType: 'post' });
  expect(trashList.err).toBeFalsy();
  expect(selects[0].data.rawSQL).toBe('LIST_TRASHED_CONTENT_ENTRIES');
  expect(selects[0].data.params.contentTypeKey).toBe('post');

  const scheduled = await emitAsync(emitter, 'listScheduledContentEntries', { ...base, dueBefore: '2030-01-01T00:00:00.000Z' });
  expect(scheduled.err).toBeFalsy();
  expect(selects[1].data.rawSQL).toBe('LIST_SCHEDULED_CONTENT_ENTRIES');
  expect(selects[1].data.params.dueBefore).toBe('2030-01-01T00:00:00.000Z');
});

test('publishScheduledContentEntries publishes due scheduled entries', async () => {
  const emitter = new EventEmitter();
  setupContentEngineEvents(emitter);

  const updates = [];
  emitter.on('dbSelect', (payload, cb) => {
    if (payload.data.rawSQL === 'LIST_SCHEDULED_CONTENT_ENTRIES') {
      return cb(null, [{ id: 5 }, { id: 6 }]);
    }
    if (payload.data.rawSQL === 'GET_CONTENT_ENTRY') {
      return cb(null, {
        id: payload.data.params.entryId,
        content_type_key: 'post',
        slug: `post-${payload.data.params.entryId}`,
        permalink: `/post/post-${payload.data.params.entryId}`,
        status: 'scheduled',
        title: `Post ${payload.data.params.entryId}`,
        language: 'en',
        content: {},
        meta: {}
      });
    }
    cb(null, null);
  });
  emitter.on('dbUpdate', (payload, cb) => {
    updates.push(payload);
    cb(null, { entryId: payload.data.params.id, status: payload.data.params.status });
  });

  const result = await emitAsync(emitter, 'publishScheduledContentEntries', {
    jwt: 'token',
    moduleName: 'contentEngine',
    moduleType: 'core',
    decodedJWT: { permissions: { content: { publish: true, update: true } } },
    dueBefore: '2030-01-01T00:00:00.000Z'
  });

  expect(result.err).toBeFalsy();
  expect(result.result.dueCount).toBe(2);
  expect(result.result.publishedCount).toBe(2);
  expect(updates.length).toBe(2);
  expect(updates[0].data.rawSQL).toBe('UPDATE_CONTENT_ENTRY');
  expect(updates[0].data.params.status).toBe('published');
});

test('createContentEntry mirrors indexed documents when searchManager is listening', async () => {
  const emitter = new EventEmitter();
  setupContentEngineEvents(emitter);

  let indexPayload = null;
  emitter.on('dbUpdate', (payload, cb) => {
    cb(null, {
      entryId: 88,
      revisionId: 1,
      version: 1,
      slug: payload.data.params.slug,
      permalink: payload.data.params.permalink
    });
  });
  emitter.on('indexSearchDocument', (payload, cb) => {
    indexPayload = payload;
    cb(null, { indexed: true });
  });

  const { err } = await emitAsync(emitter, 'createContentEntry', {
    jwt: 'token',
    moduleName: 'contentEngine',
    moduleType: 'core',
    contentType: 'post',
    title: 'Searchable',
    status: 'published',
    content: { body: '<p>Hello search</p>' }
  });

  expect(err).toBeFalsy();
  expect(indexPayload.entryId).toBe(88);
  expect(indexPayload.moduleName).toBe('searchManager');
  expect(indexPayload.visibility).toBe('public');
  expect(indexPayload.body).toBe('Hello search');
});

test('content revision events load and restore revisions', async () => {
  const emitter = new EventEmitter();
  setupContentEngineEvents(emitter);

  const selects = [];
  const updates = [];
  emitter.on('dbSelect', (payload, cb) => {
    selects.push(payload);
    if (payload.data.rawSQL === 'GET_CONTENT_ENTRY') {
      return cb(null, {
        id: payload.data.params.entryId,
        content_type_key: 'post',
        title: 'Restored',
        status: 'draft',
        content: { body: 'Restored body' },
        meta: {}
      });
    }
    cb(null, { id: 7, entry_id: 4, version: 1, title: 'Old title', content: { body: 'Old' }, meta: {} });
  });
  emitter.on('dbUpdate', (payload, cb) => {
    updates.push(payload);
    cb(null, { entryId: 4, revisionId: 8, version: 3, restoredFromRevisionId: 7, restoredFromVersion: 1 });
  });

  const loaded = await emitAsync(emitter, 'getContentRevision', {
    jwt: 'token',
    moduleName: 'contentEngine',
    moduleType: 'core',
    revisionId: 7
  });
  expect(loaded.err).toBeFalsy();
  expect(selects[0].data.rawSQL).toBe('GET_CONTENT_REVISION');
  expect(selects[0].data.params.revisionId).toBe(7);

  const restored = await emitAsync(emitter, 'restoreContentRevision', {
    jwt: 'token',
    moduleName: 'contentEngine',
    moduleType: 'core',
    decodedJWT: { permissions: { content: { update: true } } },
    revisionId: 7
  });
  expect(restored.err).toBeFalsy();
  expect(restored.result.entryId).toBe(4);
  expect(updates[0].data.rawSQL).toBe('RESTORE_CONTENT_REVISION');
  expect(updates[0].data.params.revisionId).toBe(7);
});

test('content taxonomy and term events are not registered on the content engine', () => {
  const emitter = new EventEmitter();
  setupContentEngineEvents(emitter);

  [
    'registerContentTaxonomy',
    'getContentTaxonomy',
    'listContentTaxonomies',
    'deleteContentTaxonomy',
    'upsertContentTerm',
    'getContentTerm',
    'listContentTerms',
    'deleteContentTerm',
    'assignContentTerm',
    'unassignContentTerm',
    'listContentTermsForEntry'
  ].forEach(eventName => {
    expect(emitter.listenerCount(eventName)).toBe(0);
  });
});
