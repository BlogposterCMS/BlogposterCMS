const assert = require('assert');
const EventEmitter = require('events');

const { setupSeoEvents, _internals } = require('../mother/modules/seoManager');

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

test('upsertSeoMeta normalizes source targets and strips unsafe urls', async () => {
  const emitter = new EventEmitter();
  setupSeoEvents(emitter);

  let dbPayload = null;
  emitter.on('dbUpdate', (payload, cb) => {
    dbPayload = payload;
    cb(null, { id: 1, ...payload.data.params });
  });

  const { err, result } = await emitAsync(emitter, 'upsertSeoMeta', {
    jwt: 't',
    moduleName: 'seoManager',
    moduleType: 'core',
    decodedJWT: { permissions: { seo: { manage: true } } },
    sourceModule: 'pagesManager',
    sourceId: 7,
    title: 'About',
    keywords: ['cms', 'seo'],
    canonicalUrl: 'javascript:alert(1)',
    ogImage: '/media/og.png'
  });

  assert.ifError(err);
  assert.strictEqual(dbPayload.data.rawSQL, 'UPSERT_SEO_META');
  assert.strictEqual(dbPayload.data.params.targetType, 'source');
  assert.strictEqual(dbPayload.data.params.targetKey, 'pagesManager:7');
  assert.strictEqual(dbPayload.data.params.keywords, 'cms,seo');
  assert.strictEqual(dbPayload.data.params.canonicalUrl, '');
  assert.strictEqual(result.ogImage, '/media/og.png');
});

test('resolveSeoMeta merges defaults, content entry data and explicit overrides', async () => {
  const emitter = new EventEmitter();
  setupSeoEvents(emitter);

  emitter.on('dbSelect', (payload, cb) => {
    if (payload.data.rawSQL === 'GET_SEO_META' && payload.data.params.targetType === 'global') {
      return cb(null, { title: 'Site', description: 'Default', robots: 'index,follow', meta: { site: true } });
    }
    if (payload.data.rawSQL === 'GET_SEO_META' && payload.data.params.targetType === 'entry') {
      return cb(null, { title: 'Explicit', keywords: 'one,two', meta: { explicit: true } });
    }
    cb(null, null);
  });
  emitter.on('getContentEntry', (payload, cb) => {
    cb(null, {
      id: payload.entryId,
      title: 'Entry title',
      excerpt: 'Entry excerpt',
      permalink: '/post/entry',
      content_type_key: 'post',
      meta: {
        seoTitle: 'Content title',
        metaDesc: 'Content desc',
        ogImage: '/og-entry.png'
      }
    });
  });

  const { err, result } = await emitAsync(emitter, 'resolveSeoMeta', {
    jwt: 't',
    moduleName: 'seoManager',
    moduleType: 'core',
    entryId: 42
  });

  assert.ifError(err);
  assert.strictEqual(result.target.targetType, 'entry');
  assert.strictEqual(result.seo.title, 'Explicit');
  assert.strictEqual(result.seo.description, 'Content desc');
  assert.strictEqual(result.seo.keywords, 'one,two');
  assert.strictEqual(result.seo.ogImage, '/og-entry.png');
  assert.deepStrictEqual(result.seo.meta, { site: true, contentTypeKey: 'post', entryId: 42, explicit: true });
});

test('generateSeoSitemap renders published content entries', async () => {
  const emitter = new EventEmitter();
  setupSeoEvents(emitter);

  emitter.on('listContentEntries', (payload, cb) => {
    cb(null, [
      { permalink: '/post/a', updated_at: '2024-01-01T00:00:00.000Z' },
      { permalink: '/about', updated_at: '2024-02-01T00:00:00.000Z' }
    ]);
  });

  const { err, result } = await emitAsync(emitter, 'generateSeoSitemap', {
    jwt: 't',
    moduleName: 'seoManager',
    moduleType: 'core',
    baseUrl: 'https://example.test'
  });

  assert.ifError(err);
  assert.match(result, /<loc>https:\/\/example\.test\/post\/a<\/loc>/);
  assert.match(result, /<loc>https:\/\/example\.test\/about<\/loc>/);
});

test('generateRobotsTxt uses default meta rules', async () => {
  const emitter = new EventEmitter();
  setupSeoEvents(emitter);

  emitter.on('dbSelect', (_payload, cb) => {
    cb(null, { meta: { disallow: ['/admin', 'private'] } });
  });

  const { err, result } = await emitAsync(emitter, 'generateRobotsTxt', {
    jwt: 't',
    moduleName: 'seoManager',
    moduleType: 'core',
    baseUrl: 'https://example.test'
  });

  assert.ifError(err);
  assert.match(result, /Disallow: \/admin/);
  assert.match(result, /Disallow: \/private/);
  assert.match(result, /Sitemap: https:\/\/example\.test\/sitemap\.xml/);
});

test('seo internals normalize targets and merge metadata', () => {
  assert.deepStrictEqual(_internals.normalizeTarget({ path: 'about/' }), {
    targetType: 'path',
    targetKey: '/about'
  });
  assert.strictEqual(_internals.normalizeUrl('data:text/html,hi'), '');
  assert.strictEqual(_internals.normalizeUrl('ftp://example.test/file'), '');
  assert.strictEqual(_internals.normalizeUrl('java\nscript:alert(1)'), '');
  assert.strictEqual(_internals.normalizeUrl('/media/og.png'), '/media/og.png');
  assert.strictEqual(_internals.normalizeUrl('https://example.test/og.png'), 'https://example.test/og.png');
  assert.strictEqual(_internals.baseUrl('javascript:alert(1)'), 'https://example.com');
  assert.strictEqual(_internals.baseUrl('https://example.test/blog/'), 'https://example.test/blog');
});
