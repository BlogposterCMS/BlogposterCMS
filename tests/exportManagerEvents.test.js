const assert = require('assert');
const EventEmitter = require('events');
const {
  setupExportEvents,
  _internals
} = require('../mother/modules/exportManager');

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

function routePaged(emitter, eventName, handler) {
  emitter.on(eventName, (payload, cb) => {
    const value = handler(payload);
    cb(null, value);
  });
}

test('export manager lists exporters with permission checks', async () => {
  const emitter = new EventEmitter();
  setupExportEvents(emitter);

  const denied = await emitAsync(emitter, 'listExporters', {
    jwt: 'token',
    moduleName: 'exportManager',
    moduleType: 'core',
    decodedJWT: { permissions: {} }
  });
  assert(denied.err);
  assert.match(denied.err.message, /exporters\.list/);

  const listed = await emitAsync(emitter, 'listExporters', {
    jwt: 'token',
    moduleName: 'exportManager',
    moduleType: 'core',
    decodedJWT: { permissions: { exporters: { list: true } } }
  });
  assert.ifError(listed.err);
  assert.deepStrictEqual(listed.result.map(item => item.name), ['blogposterJson', 'wordpressWxr']);
});

test('export manager builds a Blogposter JSON package from core query events', async () => {
  const emitter = new EventEmitter();
  setupExportEvents(emitter);
  const routed = [];

  routePaged(emitter, 'listContentTypes', payload => {
    routed.push({ eventName: 'listContentTypes', payload });
    return [{ key: 'post', label: 'Posts' }];
  });
  routePaged(emitter, 'listContentEntries', payload => {
    routed.push({ eventName: 'listContentEntries', payload });
    if (payload.offset > 0 || payload.status !== 'published') return [];
    return [{
      id: 1,
      content_type_key: 'post',
      slug: 'hello',
      permalink: '/post/hello',
      status: 'published',
      title: 'Hello',
      content: { html: '<p>Hello export</p>' },
      meta: {},
      language: 'en'
    }];
  });
  routePaged(emitter, 'getContentRevisions', payload => {
    routed.push({ eventName: 'getContentRevisions', payload });
    return [{ id: 99, entry_id: 1, version: 1, title: 'Hello' }];
  });
  routePaged(emitter, 'listMediaAttachments', payload => {
    routed.push({ eventName: 'listMediaAttachments', payload });
    if (payload.offset > 0 || payload.status !== 'active' || payload.visibility !== 'public') return [];
    return [{ id: 5, url: '/library/public/hello.jpg', status: 'active', visibility: 'public' }];
  });
  routePaged(emitter, 'listMediaVariants', payload => {
    routed.push({ eventName: 'listMediaVariants', payload });
    return [{ attachment_id: payload.attachmentId, variant_key: 'thumb', url: '/library/public/hello-thumb.jpg' }];
  });
  routePaged(emitter, 'listContentForMedia', payload => {
    routed.push({ eventName: 'listContentForMedia', payload });
    return [{ attachment_id: payload.attachmentId, target_type: 'contentEntry', target_id: '1' }];
  });
  routePaged(emitter, 'getMetadata', payload => {
    routed.push({ eventName: 'getMetadata', payload });
    return [{ target_type: payload.targetType, target_id: payload.targetId, meta_key: 'subtitle', value: 'Exportable' }];
  });
  routePaged(emitter, 'listSettings', payload => {
    routed.push({ eventName: 'listSettings', payload });
    return [{ key: 'SITE_TITLE', value: 'Demo Site' }];
  });
  routePaged(emitter, 'listMetaFields', payload => {
    routed.push({ eventName: 'listMetaFields', payload });
    return [{ key: 'subtitle', target_type: 'contentEntry', value_type: 'string' }];
  });

  const exported = await emitAsync(emitter, 'runExport', {
    jwt: 'token',
    moduleName: 'exportManager',
    moduleType: 'core',
    decodedJWT: { permissions: { exporters: { run: true } } },
    exporterName: 'blogposterJson',
    options: { statuses: ['published'] }
  });

  assert.ifError(exported.err);
  assert.strictEqual(exported.result.format, 'blogposter-json');
  assert.strictEqual(exported.result.manifest.counts.entries, 1);
  assert.strictEqual(exported.result.manifest.counts.mediaAttachments, 1);
  assert.strictEqual(exported.result.data.entries[0].title, 'Hello');
  assert.strictEqual(exported.result.data.media.variantsByAttachmentId[5][0].variant_key, 'thumb');
  assert.match(exported.result.content, /"SITE_TITLE"/);
  assert.strictEqual(routed[0].payload.moduleName, 'contentEngine');
});

test('export manager builds WordPress WXR from published content', async () => {
  const emitter = new EventEmitter();
  setupExportEvents(emitter);

  routePaged(emitter, 'listContentTypes', () => [{ key: 'post', label: 'Posts' }]);
  routePaged(emitter, 'listContentEntries', payload => {
    if (payload.offset > 0) return [];
    assert.strictEqual(payload.status, 'published');
    return [{
      id: 7,
      content_type_key: 'post',
      slug: 'launch',
      permalink: '/post/launch',
      status: 'published',
      title: 'Launch',
      author_id: 'admin',
      excerpt: 'Short',
      content: { html: '<p>Launch body</p>' },
      published_at: '2026-01-01T10:00:00.000Z'
    }];
  });
  routePaged(emitter, 'getMetadata', () => [{ meta_key: '_seo_title', value: 'Launch SEO' }]);
  routePaged(emitter, 'listSettings', () => [
    { key: 'SITE_TITLE', value: 'Demo Site' },
    { key: 'SITE_URL', value: 'https://example.test' }
  ]);
  routePaged(emitter, 'listMetaFields', () => []);

  const exported = await emitAsync(emitter, 'runExport', {
    jwt: 'token',
    moduleName: 'exportManager',
    moduleType: 'core',
    decodedJWT: { permissions: { exporters: { run: true } } },
    exporterName: 'wordpressWxr'
  });

  assert.ifError(exported.err);
  assert.strictEqual(exported.result.format, 'wordpress-wxr');
  assert.match(exported.result.content, /<wp:wxr_version>1\.2<\/wp:wxr_version>/);
  assert.match(exported.result.content, /<wp:post_type>post<\/wp:post_type>/);
  assert.match(exported.result.content, /Launch body/);
  assert.doesNotMatch(exported.result.content, /<category\s+domain=/);
  assert.doesNotMatch(exported.result.content, /<wp:(category|tag)>/);
  assert.strictEqual(_internals.resolveExporterName('wordpress'), 'wordpressWxr');
});

test('export manager rejects control option overrides and unsafe filenames', async () => {
  const emitter = new EventEmitter();
  setupExportEvents(emitter);

  const controlOverride = await emitAsync(emitter, 'runExport', {
    jwt: 'token',
    moduleName: 'exportManager',
    moduleType: 'core',
    decodedJWT: { permissions: { exporters: { run: true } } },
    exporterName: 'blogposterJson',
    options: {
      jwt: 'other-token'
    }
  });
  assert(controlOverride.err);
  assert.match(controlOverride.err.message, /cannot override jwt/);

  const unsafeNames = [
    '../backup.json',
    'folder/backup.json',
    'C:\\backup.json',
    '.',
    'backup?.json',
    'backup\u0000.json'
  ];

  for (const fileName of unsafeNames) {
    const result = await emitAsync(emitter, 'runExport', {
      jwt: 'token',
      moduleName: 'exportManager',
      moduleType: 'core',
      decodedJWT: { permissions: { exporters: { run: true } } },
      exporterName: 'blogposterJson',
      options: {
        includeContent: false,
        includeContentTypes: false,
        includeMedia: false,
        includeSettings: false,
        includeMetadata: false,
        fileName
      }
    });
    assert(result.err, `expected ${fileName} to be rejected`);
    assert.match(result.err.message, /Invalid export fileName/);
  }
});

test('export manager normalizes safe export filename and site URL options', async () => {
  const emitter = new EventEmitter();
  setupExportEvents(emitter);

  const exported = await emitAsync(emitter, 'runExport', {
    jwt: 'token',
    moduleName: 'exportManager',
    moduleType: 'core',
    decodedJWT: { permissions: { exporters: { run: true } } },
    exporterName: 'wordpressWxr',
    options: {
      includeContent: false,
      includeContentTypes: false,
      includeSettings: false,
      includeMetadata: false,
      fileName: 'wordpress-export.xml',
      siteUrl: 'https://example.test///'
    }
  });

  assert.ifError(exported.err);
  assert.strictEqual(exported.result.fileName, 'wordpress-export.xml');
  assert.match(exported.result.content, /<wp:base_site_url>https:\/\/example\.test<\/wp:base_site_url>/);
});
