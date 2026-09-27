const assert = require('assert');
const { ObjectId } = require('mongodb');

const { handleCommentsMongo } = require('../mother/modules/databaseManager/placeholders/commentsPlaceholders');
const { handleContentEngineMongo } = require('../mother/modules/databaseManager/placeholders/contentEnginePlaceholders');
const { handleMediaMongo } = require('../mother/modules/databaseManager/placeholders/mediaPlaceholders');
const { handleMetadataMongo } = require('../mother/modules/databaseManager/placeholders/metadataPlaceholders');
const { handleBuiltInPlaceholderMongo } = require('../mother/modules/databaseManager/placeholders/mongoPlaceholders');
const { handleNavigationMongo } = require('../mother/modules/databaseManager/placeholders/navigationPlaceholders');
const { handleRedirectMongo } = require('../mother/modules/databaseManager/placeholders/redirectPlaceholders');
const { handleSearchMongo } = require('../mother/modules/databaseManager/placeholders/searchPlaceholders');

function fakeDb(resolveFindOne = () => null) {
  const calls = [];
  const db = {
    calls,
    collection(name) {
      const cursor = {
        sort() { return this; },
        skip() { return this; },
        limit() { return this; },
        project() { return this; },
        async toArray() { return []; }
      };
      return {
        async findOne(query, options) {
          calls.push({ name, method: 'findOne', query, options });
          return resolveFindOne(name, query, options);
        },
        find(query) {
          calls.push({ name, method: 'find', query });
          return cursor;
        },
        async updateOne(query, update, options) {
          calls.push({ name, method: 'updateOne', query, update, options });
          return { matchedCount: 0, upsertedCount: options?.upsert ? 1 : 0 };
        },
        async updateMany(query, update, options) {
          calls.push({ name, method: 'updateMany', query, update, options });
          return { matchedCount: 0 };
        },
        async deleteOne(query) {
          calls.push({ name, method: 'deleteOne', query });
          return { deletedCount: 0 };
        },
        async deleteMany(query) {
          calls.push({ name, method: 'deleteMany', query });
          return { deletedCount: 0 };
        },
        async insertOne(document) {
          calls.push({ name, method: 'insertOne', document });
          return { insertedId: document._id };
        },
        async insertMany(documents) {
          calls.push({ name, method: 'insertMany', documents });
          return { insertedCount: documents.length };
        }
      };
    }
  };
  return db;
}

function callsFor(db, name, method) {
  return db.calls.filter(call => call.name === name && call.method === method);
}

test('comments Mongo filters bind entry/source/status values as literals', async () => {
  const db = fakeDb();
  await handleCommentsMongo(db, 'LIST_COMMENTS_FOR_ENTRY', {
    sourceModule: { $ne: null },
    sourceId: { nested: { $gt: '' } },
    status: { $regex: '.*' }
  });
  await handleCommentsMongo(db, 'LIST_COMMENTS_FOR_ENTRY', {
    entryId: 'entry-1',
    status: 'approved'
  });

  const [adversarial, normal] = callsFor(db, 'comments', 'find').map(call => call.query);
  assert.deepStrictEqual(adversarial, {
    deleted_at: null,
    source_module: { $eq: '[object Object]' },
    source_id: { $eq: '[object Object]' },
    status: { $eq: '[object Object]' }
  });
  assert.deepStrictEqual(normal, {
    deleted_at: null,
    entry_id: { $eq: 'entry-1' },
    status: { $eq: 'approved' }
  });
});

test('content Mongo filters preserve domain operators while literalizing caller values', async () => {
  const db = fakeDb();
  const key = { $ne: null };
  await handleContentEngineMongo(db, 'UPSERT_CONTENT_TYPE', { key, label: 'Unsafe' });
  await handleContentEngineMongo(db, 'GET_CONTENT_TYPE', { key: [{ $gt: '' }] });
  await handleContentEngineMongo(db, 'GET_CONTENT_ENTRY_BY_SOURCE', {
    sourceModule: { $regex: '.*' }, sourceId: { nested: { $ne: null } }
  });
  await handleContentEngineMongo(db, 'FIND_CONTENT_ENTRY_CONFLICT', {
    permalink: { $ne: null }, contentTypeKey: { $gt: '' }, slug: [{ $regex: '.*' }],
    language: { nested: true }, entryId: { $ne: null }
  });
  const objectId = new ObjectId();
  await handleContentEngineMongo(db, 'GET_CONTENT_ENTRY', { entryId: objectId.toHexString() });
  await handleContentEngineMongo(db, 'LIST_SCHEDULED_CONTENT_ENTRIES', {
    contentTypeKey: { $ne: null }, language: { $regex: '.*' }, dueBefore: '2026-09-21T00:00:00.000Z'
  });

  const typeWrites = callsFor(db, 'content_types', 'updateOne');
  const typeReads = callsFor(db, 'content_types', 'findOne');
  assert.deepStrictEqual(typeWrites[0].query, { key: { $eq: '[object Object]' } });
  assert.strictEqual(typeWrites[0].update.$set.key, key);
  assert.deepStrictEqual(typeReads[0].query, typeWrites[0].query);
  assert.deepStrictEqual(typeReads[1].query, { key: { $eq: '[object Object]' } });

  const entryReads = callsFor(db, 'content_entries', 'findOne');
  assert.deepStrictEqual(entryReads[0].query, {
    source_module: { $eq: '[object Object]' },
    source_id: { $eq: '[object Object]' },
    deleted_at: null
  });
  assert.deepStrictEqual(entryReads[1].query.$and[0].$or[0], { permalink: { $eq: '[object Object]' } });
  assert.deepStrictEqual(entryReads[1].query.$and[0].$or[1], {
    content_type_key: { $eq: '[object Object]' },
    slug: { $eq: '[object Object]' },
    language: { $eq: '[object Object]' }
  });
  assert.deepStrictEqual(entryReads[1].query.$and[1], {
    $nor: [{ id: { $in: ['[object Object]'] } }]
  });
  assert(entryReads[2].query.$or[0]._id instanceof ObjectId);
  assert.strictEqual(entryReads[2].query.$or[0]._id.toHexString(), objectId.toHexString());
  assert.deepStrictEqual(entryReads[2].query.$or[1], { id: { $in: [objectId.toHexString()] } });
  assert.strictEqual(entryReads[2].query.deleted_at, null);

  const scheduled = callsFor(db, 'content_entries', 'find')[0].query;
  assert.strictEqual(scheduled.status, 'scheduled');
  assert.deepStrictEqual(scheduled.published_at, { $ne: null, $lte: '2026-09-21T00:00:00.000Z' });
  assert.deepStrictEqual(scheduled.content_type_key, { $eq: '[object Object]' });
  assert.deepStrictEqual(scheduled.language, { $eq: '[object Object]' });
});

test('media Mongo attachment, variant and relation filters reject operator objects', async () => {
  const db = fakeDb();
  const sourceModule = { $ne: null };
  const sourceId = { $gt: '' };
  await handleMediaMongo(db, 'UPSERT_MEDIA_ATTACHMENT', {
    sourceModule, sourceId, fileName: 'hero.jpg', status: 'active'
  });
  await handleMediaMongo(db, 'GET_MEDIA_ATTACHMENT', { sourceModule, sourceId });
  await handleMediaMongo(db, 'LIST_MEDIA_ATTACHMENTS', {
    category: { $ne: null }, fileType: [{ $gt: '' }], mimeType: { nested: true },
    status: { $regex: '.*' }, visibility: { $ne: null }, folder: { $gt: '' }
  });
  await handleMediaMongo(db, 'UPSERT_MEDIA_VARIANT', {
    attachmentId: ['media-1'], variantKey: { $ne: null }, url: '/hero.webp'
  });
  await handleMediaMongo(db, 'LIST_MEDIA_VARIANTS', { attachmentId: 42 });
  await handleMediaMongo(db, 'DELETE_MEDIA_VARIANT', {
    attachmentId: { nested: true }, variantKey: { $regex: '.*' }
  });
  await handleMediaMongo(db, 'LINK_MEDIA_ATTACHMENT', {
    attachmentId: 'media-1', targetType: { $ne: null }, targetId: { $gt: '' }, role: { $regex: '.*' }
  });
  await handleMediaMongo(db, 'UNLINK_MEDIA_ATTACHMENT', {
    attachmentId: 'media-1', targetType: { $ne: null }, targetId: { $gt: '' }, role: { $regex: '.*' }
  });
  await handleMediaMongo(db, 'LIST_MEDIA_FOR_CONTENT', {
    targetType: [{ $ne: null }], targetId: { nested: true }
  });

  const attachmentUpdates = callsFor(db, 'media_attachments', 'updateOne');
  assert.deepStrictEqual(attachmentUpdates[0].query, {
    source_module: { $eq: '[object Object]' }, source_id: { $eq: '[object Object]' }
  });
  assert.strictEqual(attachmentUpdates[0].update.$set.source_module, sourceModule);
  assert.strictEqual(attachmentUpdates[0].update.$set.source_id, sourceId);
  const attachmentList = callsFor(db, 'media_attachments', 'find')[0].query;
  for (const field of ['category', 'file_type', 'mime_type', 'status', 'visibility', 'folder']) {
    assert.deepStrictEqual(attachmentList[field], { $eq: '[object Object]' }, field);
  }

  const variantQueries = [
    callsFor(db, 'media_variants', 'updateOne')[0].query,
    callsFor(db, 'media_variants', 'deleteOne')[0].query
  ];
  assert.deepStrictEqual(variantQueries[0].attachment_id, { $eq: 'media-1' });
  assert.deepStrictEqual(variantQueries[0].variant_key, { $eq: '[object Object]' });
  assert.deepStrictEqual(callsFor(db, 'media_variants', 'findOne')[0].query, variantQueries[0]);
  assert.deepStrictEqual(callsFor(db, 'media_variants', 'find')[0].query, { attachment_id: { $eq: '42' } });
  assert.deepStrictEqual(variantQueries[1].attachment_id, { $eq: '[object Object]' });
  assert.deepStrictEqual(variantQueries[1].variant_key, { $eq: '[object Object]' });

  const relationQueries = [
    callsFor(db, 'media_relations', 'updateOne')[0].query,
    callsFor(db, 'media_relations', 'deleteOne')[0].query,
    callsFor(db, 'media_relations', 'find')[0].query
  ];
  for (const query of relationQueries) {
    assert.deepStrictEqual(query.target_type, { $eq: '[object Object]' });
    assert.deepStrictEqual(query.target_id, { $eq: '[object Object]' });
  }
  assert.deepStrictEqual(relationQueries[0].role, { $eq: '[object Object]' });
});

test('metadata Mongo selectors bind strings and booleans without changing stored values', async () => {
  const db = fakeDb();
  const targetType = { $ne: null };
  const metaKey = { $regex: '.*' };
  await handleMetadataMongo(db, 'UPSERT_META_FIELD', { targetType, metaKey, label: 'Unsafe', public: true });
  await handleMetadataMongo(db, 'LIST_META_FIELDS', { targetType, public: false });
  await handleMetadataMongo(db, 'UPSERT_METADATA_VALUE', {
    targetType, targetId: { $gt: '' }, metaKey, language: [{ $ne: null }], value: { retained: true }
  });
  await handleMetadataMongo(db, 'GET_METADATA_VALUES', {
    targetType, targetId: { nested: true }, metaKey, language: { $ne: null }, visibility: { $regex: '.*' }
  });
  await handleMetadataMongo(db, 'DELETE_METADATA_FOR_TARGET', { targetType, targetId: { $gt: '' } });

  const fieldWrite = callsFor(db, 'metadata_fields', 'updateOne')[0];
  assert.deepStrictEqual(fieldWrite.query, {
    target_type: { $eq: '[object Object]' }, meta_key: { $eq: '[object Object]' }
  });
  assert.strictEqual(fieldWrite.update.$set.target_type, targetType);
  assert.strictEqual(fieldWrite.update.$set.meta_key, metaKey);
  assert.deepStrictEqual(callsFor(db, 'metadata_fields', 'find')[0].query, {
    target_type: { $eq: '[object Object]' }, public: { $eq: false }
  });

  const valueWrite = callsFor(db, 'metadata_values', 'updateOne')[0];
  assert.deepStrictEqual(valueWrite.query, {
    target_type: { $eq: '[object Object]' },
    target_id: { $eq: '[object Object]' },
    meta_key: { $eq: '[object Object]' },
    language: { $eq: '[object Object]' }
  });
  assert.deepStrictEqual(valueWrite.update.$set.value, { retained: true });
  assert.deepStrictEqual(callsFor(db, 'metadata_values', 'findOne')[0].query, valueWrite.query);
  const valueRead = callsFor(db, 'metadata_values', 'find')[0].query;
  assert.deepStrictEqual(valueRead.visibility, { $eq: '[object Object]' });
  assert.deepStrictEqual(callsFor(db, 'metadata_values', 'deleteMany')[0].query.target_type, { $eq: '[object Object]' });
});

test('navigation Mongo key, location, menu and status filters are literal', async () => {
  const db = fakeDb();
  const key = { $ne: null };
  await handleNavigationMongo(db, 'UPSERT_NAVIGATION_LOCATION', { key, label: 'Primary' });
  await handleNavigationMongo(db, 'UPSERT_NAVIGATION_MENU', { key, label: 'Main' });
  await handleNavigationMongo(db, 'GET_NAVIGATION_MENU', { locationKey: { $regex: '.*' } });
  await handleNavigationMongo(db, 'LIST_NAVIGATION_MENUS', { locationKey: [{ $gt: '' }] });
  await handleNavigationMongo(db, 'SET_NAVIGATION_MENU_ITEMS', { menuId: { nested: true }, items: [] });
  await handleNavigationMongo(db, 'LIST_NAVIGATION_MENU_ITEMS', {
    menuId: { $ne: null }, status: { $regex: '.*' }
  });

  const locationWrite = callsFor(db, 'navigation_locations', 'updateOne')[0];
  assert.deepStrictEqual(locationWrite.query, { key: { $eq: '[object Object]' } });
  assert.strictEqual(locationWrite.update.$set.key, key);
  assert.deepStrictEqual(callsFor(db, 'navigation_locations', 'findOne')[0].query, locationWrite.query);
  const menuWrite = callsFor(db, 'navigation_menus', 'updateOne')[0];
  assert.deepStrictEqual(menuWrite.query, { key: { $eq: '[object Object]' } });
  assert.deepStrictEqual(callsFor(db, 'navigation_menus', 'findOne').at(-1).query, {
    location_key: { $eq: '[object Object]' }
  });
  assert.deepStrictEqual(callsFor(db, 'navigation_menus', 'find')[0].query, {
    location_key: { $eq: '[object Object]' }
  });
  assert.deepStrictEqual(callsFor(db, 'navigation_items', 'updateMany')[0].query.menu_id, { $eq: '[object Object]' });
  assert.deepStrictEqual(callsFor(db, 'navigation_items', 'find')[0].query, {
    menu_id: { $eq: '[object Object]' }, deleted_at: null, status: { $eq: '[object Object]' }
  });
});

test('redirect Mongo lookups preserve $in/$and ranges with scalar language values', async () => {
  const db = fakeDb();
  await handleRedirectMongo(db, 'UPSERT_REDIRECT_RULE', {
    fromPath: '/old', toPath: '/new', language: 'en'
  });
  await handleRedirectMongo(db, 'GET_REDIRECT_RULE', {
    fromPath: { $ne: null }, language: { $regex: '.*' }
  });
  await handleRedirectMongo(db, 'RESOLVE_REDIRECT', {
    language: [{ $ne: null }], now: '2026-09-21T00:00:00.000Z'
  });
  await handleRedirectMongo(db, 'LIST_REDIRECT_HITS', {
    ruleId: { $gt: '' }, fromPath: { nested: true }
  });

  const redirectWrite = callsFor(db, 'redirect_rules', 'updateOne')[0];
  assert.deepStrictEqual(redirectWrite.query, {
    from_path: { $eq: '/old' }, language: { $eq: 'en' }
  });
  assert.deepStrictEqual(callsFor(db, 'redirect_rules', 'findOne')[0].query, redirectWrite.query);
  assert.deepStrictEqual(callsFor(db, 'redirect_rules', 'findOne')[1].query, {
    from_path: { $eq: '[object Object]' }, language: { $eq: '[object Object]' }
  });
  const resolveQuery = callsFor(db, 'redirect_rules', 'find')[0].query;
  assert(Array.isArray(resolveQuery.$and));
  assert.deepStrictEqual(resolveQuery.$and[1], { language: { $in: ['', '[object Object]'] } });
  assert.deepStrictEqual(resolveQuery.$and[2], {
    $or: [{ start_at: null }, { start_at: '' }, { start_at: { $lte: '2026-09-21T00:00:00.000Z' } }]
  });
  assert.deepStrictEqual(callsFor(db, 'redirect_hits', 'find')[0].query, {
    rule_id: { $eq: '[object Object]' }, from_path: { $eq: '[object Object]' }
  });
});

test('search Mongo filters keep search/tag operators but literalize scalar dimensions', async () => {
  const db = fakeDb();
  await handleSearchMongo(db, 'UPSERT_SEARCH_DOCUMENT', {
    sourceModule: 'contentEngine', sourceId: 42, title: 'Normal'
  });
  await handleSearchMongo(db, 'SEARCH_DOCUMENTS', {
    query: { $regex: '.*' },
    contentTypeKey: { $ne: null },
    language: [{ $gt: '' }],
    status: { nested: true },
    visibility: { $regex: '.*' },
    tags: ['news', { $ne: null }]
  });

  const searchWrite = callsFor(db, 'search_documents', 'updateOne')[0];
  assert.deepStrictEqual(searchWrite.query, { source_module: 'contentEngine', source_id: '42' });
  assert.deepStrictEqual(callsFor(db, 'search_documents', 'findOne')[0].query, searchWrite.query);

  const query = callsFor(db, 'search_documents', 'find')[0].query;
  assert.deepStrictEqual(query.content_type_key, { $eq: '[object Object]' });
  assert.deepStrictEqual(query.language, { $eq: '[object Object]' });
  assert.deepStrictEqual(query.status, { $eq: '[object Object]' });
  assert.deepStrictEqual(query.visibility, { $eq: '[object Object]' });
  assert.deepStrictEqual(query['meta.tags'], { $all: ['news', '[object Object]'] });
  assert(Array.isArray(query.$and));
  assert.strictEqual(typeof query.$and[0].search_text.$regex, 'string');
});

test('built-in settings and page Mongo filters normalize operators without mutating writes', async () => {
  const pageId = new ObjectId();
  const db = fakeDb(name => (name === 'pages' ? { _id: pageId, id: pageId.toHexString(), parent_id: null } : null));
  const key = { $ne: null };
  const value = { keep: { $gt: '' } };
  await handleBuiltInPlaceholderMongo(db, 'GET_SETTING', [key]);
  await handleBuiltInPlaceholderMongo(db, 'UPSERT_SETTING', [key, value]);
  await handleBuiltInPlaceholderMongo(db, 'LIST_SETTINGS', [{ keys: [key, [{ $regex: '.*' }]] }]);
  await handleBuiltInPlaceholderMongo(db, 'DELETE_SETTING', [key]);
  await handleBuiltInPlaceholderMongo(db, 'GET_PAGE_BY_ID', [pageId.toHexString(), { $ne: null }]);
  await handleBuiltInPlaceholderMongo(db, 'GET_PAGE_BY_SLUG', [{ $ne: null }, { $gt: '' }, { $regex: '.*' }]);
  await handleBuiltInPlaceholderMongo(db, 'UPDATE_PAGE', [{
    pageId: pageId.toHexString(),
    translations: [{ language: { $ne: null }, title: 'Title' }]
  }]);
  await handleBuiltInPlaceholderMongo(db, 'SEARCH_PAGES', [{ query: 'home', lane: { $ne: null } }]);

  assert.deepStrictEqual(callsFor(db, 'cms_settings', 'findOne')[0].query, { key: { $eq: '[object Object]' } });
  const settingWrite = callsFor(db, 'cms_settings', 'updateOne')[0];
  assert.deepStrictEqual(settingWrite.query, { key: '[object Object]' });
  assert.strictEqual(settingWrite.update.$set.value, value);
  assert.deepStrictEqual(callsFor(db, 'cms_settings', 'find')[0].query, {
    key: { $in: ['[object Object]', '[object Object]'] }
  });
  assert.deepStrictEqual(callsFor(db, 'cms_settings', 'deleteOne')[0].query, { key: { $eq: '[object Object]' } });

  const translationReads = callsFor(db, 'page_translations', 'findOne');
  assert.deepStrictEqual(translationReads[0].query.language, { $eq: '[object Object]' });
  assert.deepStrictEqual(translationReads[1].query.language, { $eq: '[object Object]' });
  const slugRead = callsFor(db, 'pages', 'findOne')[1].query;
  assert.deepStrictEqual(slugRead, {
    slug: { $eq: '[object Object]' }, lane: { $eq: '[object Object]' }
  });
  assert.deepStrictEqual(callsFor(db, 'page_translations', 'updateOne')[0].query.language, '[object Object]');
  assert.deepStrictEqual(callsFor(db, 'pages', 'find')[0].query.lane, { $eq: '[object Object]' });
});
