const assert = require('assert');
const EventEmitter = require('events');

const {
  buildPageContentEntryPayload,
  buildPageDataFromPageRow,
  mirrorPageToContentEngine,
  trashPageContentEntry
} = require('../mother/modules/pagesManager/contentEngineAdapter');

test('page content mirror maps legacy page data to a content entry payload', () => {
  const payload = buildPageContentEntryPayload({
    jwt: 't',
    pageId: 12,
    title: 'Settings',
    slug: 'settings',
    status: 'published',
    seo_image: 'hero.png',
    lane: 'admin',
    language: 'en',
    translations: [{
      language: 'en',
      title: 'Settings',
      html: '<main>Settings</main>',
      css: '.settings{}',
      metaDesc: 'Admin settings',
      seoTitle: 'Settings SEO',
      seoKeywords: 'settings,cms'
    }],
    parent_id: null,
    is_content: false,
    weight: 3
  });

  assert.strictEqual(payload.moduleName, 'contentEngine');
  assert.strictEqual(payload.moduleType, 'core');
  assert.strictEqual(payload.contentTypeKey, 'page');
  assert.strictEqual(payload.sourceModule, 'pagesManager');
  assert.strictEqual(payload.sourceId, '12');
  assert.strictEqual(payload.permalink, '/admin/settings');
  assert.strictEqual(payload.meta.legacyPageId, 12);
  assert.strictEqual(payload.meta.seoImage, 'hero.png');
  assert.strictEqual(payload.content.html, '<main>Settings</main>');
  assert.strictEqual(payload.content.translations.length, 1);
});

test('page content mirror can build page data from a database row', () => {
  const data = buildPageDataFromPageRow('t', {
    id: 4,
    slug: 'about',
    title: 'About',
    status: 'draft',
    lane: 'public',
    language: 'de',
    html: '<p>Hallo</p>',
    css: '.about{}',
    meta_desc: 'About desc',
    seo_title: 'About SEO',
    seo_keywords: 'about,team',
    meta: { template: 'plain' },
    weight: 2
  });

  assert.strictEqual(data.jwt, 't');
  assert.strictEqual(data.pageId, 4);
  assert.strictEqual(data.language, 'de');
  assert.strictEqual(data.translations[0].html, '<p>Hallo</p>');
  assert.deepStrictEqual(data.meta, { template: 'plain' });
});

test('page content mirror creates a content entry on first mirror', async () => {
  const emitter = new EventEmitter();
  let lookupPayload = null;
  let createPayload = null;

  emitter.on('getContentEntryBySource', (payload, cb) => {
    lookupPayload = payload;
    cb(null, null);
  });
  emitter.on('createContentEntry', (payload, cb) => {
    createPayload = payload;
    cb(null, { entryId: 22 });
  });

  const result = await mirrorPageToContentEngine(emitter, {
    jwt: 't',
    pageId: 7,
    title: 'About',
    slug: 'about',
    status: 'draft',
    lane: 'public',
    language: 'en',
    translations: [{ language: 'en', title: 'About', html: '<p>About</p>' }]
  });

  assert.ifError(result.err);
  assert.strictEqual(result.result.entryId, 22);
  assert.strictEqual(lookupPayload.sourceModule, 'pagesManager');
  assert.strictEqual(lookupPayload.sourceId, '7');
  assert.strictEqual(createPayload.sourceModule, 'pagesManager');
  assert.strictEqual(createPayload.sourceId, '7');
  assert.strictEqual(createPayload.permalink, '/about');
});

test('page content mirror updates an existing content entry by source', async () => {
  const emitter = new EventEmitter();
  let updatePayload = null;

  emitter.on('getContentEntryBySource', (_payload, cb) => {
    cb(null, { id: 31, slug: 'old-about', title: 'Old About' });
  });
  emitter.on('updateContentEntry', (payload, cb) => {
    updatePayload = payload;
    cb(null, { entryId: 31, version: 2 });
  });

  const result = await mirrorPageToContentEngine(emitter, {
    jwt: 't',
    pageId: 7,
    title: 'About',
    slug: 'about',
    status: 'published',
    lane: 'public',
    language: 'en',
    translations: [{ language: 'en', title: 'About', html: '<p>Updated</p>' }]
  });

  assert.ifError(result.err);
  assert.strictEqual(result.result.entryId, 31);
  assert.strictEqual(updatePayload.entryId, 31);
  assert.strictEqual(updatePayload.sourceId, '7');
  assert.strictEqual(updatePayload.status, 'published');
});

test('page content mirror skips first mirror for incomplete partial page data', async () => {
  const emitter = new EventEmitter();
  let createCalled = false;

  emitter.on('getContentEntryBySource', (_payload, cb) => {
    cb(null, null);
  });
  emitter.on('createContentEntry', (_payload, cb) => {
    createCalled = true;
    cb(null, { entryId: 99 });
  });

  const result = await mirrorPageToContentEngine(emitter, {
    jwt: 't',
    pageId: 7,
    status: 'archived'
  });

  assert.strictEqual(result.skipped, true);
  assert.strictEqual(result.reason, 'incomplete-page-data');
  assert.strictEqual(createCalled, false);
});

test('page content mirror trashes an existing content entry by page source', async () => {
  const emitter = new EventEmitter();
  let lookupPayload = null;
  let trashPayload = null;

  emitter.on('getContentEntryBySource', (payload, cb) => {
    lookupPayload = payload;
    cb(null, { id: 31, sourceModule: 'pagesManager', sourceId: '7' });
  });
  emitter.on('trashContentEntry', (payload, cb) => {
    trashPayload = payload;
    cb(null, { entryId: payload.entryId, status: 'deleted' });
  });

  const result = await trashPageContentEntry(emitter, {
    jwt: 't',
    pageId: 7,
    deletedBy: 'user-1'
  });

  assert.ifError(result.err);
  assert.strictEqual(result.result.entryId, 31);
  assert.strictEqual(lookupPayload.moduleName, 'contentEngine');
  assert.strictEqual(lookupPayload.moduleType, 'core');
  assert.strictEqual(lookupPayload.sourceModule, 'pagesManager');
  assert.strictEqual(lookupPayload.sourceId, '7');
  assert.strictEqual(trashPayload.moduleName, 'contentEngine');
  assert.strictEqual(trashPayload.moduleType, 'core');
  assert.strictEqual(trashPayload.entryId, 31);
  assert.strictEqual(trashPayload.deletedBy, 'user-1');
  assert.strictEqual(trashPayload.decodedJWT, undefined);
});

test('page content mirror skips trash when the page has no content entry', async () => {
  const emitter = new EventEmitter();
  let trashCalled = false;

  emitter.on('getContentEntryBySource', (_payload, cb) => {
    cb(null, null);
  });
  emitter.on('trashContentEntry', (_payload, cb) => {
    trashCalled = true;
    cb(null, { ok: true });
  });

  const result = await trashPageContentEntry(emitter, {
    jwt: 't',
    pageId: 7
  });

  assert.strictEqual(result.skipped, true);
  assert.strictEqual(result.reason, 'missing-content-entry');
  assert.strictEqual(trashCalled, false);
});
