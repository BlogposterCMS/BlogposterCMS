const assert = require('assert');
const EventEmitter = require('events');
const os = require('os');
const path = require('path');

const importer = require('../mother/modules/importer/importers/staticSiteAssets');

function manifestFixture() {
  return {
    format: 'blogposter-static-site-assets',
    schemaVersion: 1,
    packageKey: 'example-site',
    pages: [{
      slug: 'download',
      lane: 'public',
      language: 'en',
      translation: {
        html: '<link href="/media/site/site.css"><a href="https://cdn.example.test/apps/app.apk">Download</a>'
      }
    }],
    assets: [
      {
        path: 'public/site/site.css',
        url: '/media/site/site.css',
        sizeBytes: 120,
        checksum: 'sha256:css'
      },
      {
        sourceId: 'android-preview',
        fileName: 'app.apk',
        mimeType: 'application/vnd.android.package-archive',
        storage: {
          provider: 'aliyun-oss',
          objectKey: 'downloads/android/app.apk',
          deliveryUrl: 'https://cdn.example.test/apps/app.apk'
        },
        artifact: {
          platform: 'android',
          channel: 'preview',
          version: '1.2.3',
          buildNumber: '42'
        }
      }
    ]
  };
}

function emitAsync(emitter, eventName, payload) {
  return new Promise((resolve, reject) => {
    emitter.emit(eventName, payload, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

test('static site asset importer builds a provider-neutral media plan', async () => {
  const result = await importer.import({ manifest: manifestFixture() });

  assert.strictEqual(result.applied, false);
  assert.deepStrictEqual(result.plan.totals, {
    assets: 2,
    pages: 1,
    relations: 2,
    downloads: 1,
    remoteAssets: 1
  });
  assert.strictEqual(result.plan.assets[0].url, '/media/site/site.css');
  assert.strictEqual(result.plan.assets[0].category, 'stylesheet');
  assert.strictEqual(result.plan.assets[1].storage.provider, 'aliyun-oss');
  assert.strictEqual(result.plan.assets[1].storagePath, 'downloads/android/app.apk');
  assert.strictEqual(result.plan.assets[1].category, 'download');
  assert.deepStrictEqual(result.plan.assets[1].artifact, {
    kind: 'application-package',
    platform: 'android',
    channel: 'preview',
    version: '1.2.3',
    build: '42'
  });
  assert.deepStrictEqual(result.plan.relations.map(relation => relation.role), ['stylesheet', 'download']);
});

test('static site asset importer applies stable upserts and page relations', async () => {
  const emitter = new EventEmitter();
  const attachments = new Map();
  const attachmentCalls = [];
  const relationCalls = [];

  emitter.on('createMediaAttachment', (payload, callback) => {
    attachmentCalls.push(payload);
    if (!attachments.has(payload.sourceId)) attachments.set(payload.sourceId, attachments.size + 1);
    callback(null, { id: attachments.get(payload.sourceId) });
  });
  emitter.on('getPageBySlug', (payload, callback) => callback(null, { id: 17, slug: payload.slug }));
  emitter.on('linkMediaToContent', (payload, callback) => {
    relationCalls.push(payload);
    callback(null, { id: relationCalls.length });
  });

  const options = {
    manifest: manifestFixture(),
    dryRun: false,
    motherEmitter: emitter,
    jwt: 'test-token',
    decodedJWT: { permissions: { 'media.manage': true } }
  };
  const first = await importer.import(options);
  const second = await importer.import(options);

  assert.strictEqual(first.totals.assets, 2);
  assert.strictEqual(first.totals.relations, 2);
  assert.strictEqual(second.totals.assets, 2);
  assert.strictEqual(attachments.size, 2);
  assert.deepStrictEqual(
    attachmentCalls.slice(0, 2).map(call => call.sourceId),
    attachmentCalls.slice(2).map(call => call.sourceId)
  );
  assert.strictEqual(attachmentCalls[1].meta.storage.provider, 'aliyun-oss');
  assert.strictEqual(attachmentCalls[1].meta.artifact.version, '1.2.3');
  assert.strictEqual(relationCalls[1].role, 'download');
  assert.strictEqual(relationCalls[1].targetId, 'pagesManager:17');
});

test('static site asset importer reports missing page relations without losing assets', async () => {
  const emitter = new EventEmitter();
  emitter.on('createMediaAttachment', (_payload, callback) => callback(null, { id: 9 }));
  emitter.on('getPageBySlug', (_payload, callback) => callback(null, null));

  const result = await importer.import({
    manifest: manifestFixture(),
    dryRun: false,
    motherEmitter: emitter,
    jwt: 'test-token',
    decodedJWT: { permissions: { 'media.manage': true } }
  });

  assert.strictEqual(result.totals.assets, 2);
  assert.strictEqual(result.totals.relations, 0);
  assert.strictEqual(result.totals.warnings, 2);
  assert(result.warnings.every(warning => warning.code === 'STATIC_SITE_ASSET_PAGE_NOT_FOUND'));
});

test('static site asset importer rejects traversal paths and unsafe delivery URLs', async () => {
  const traversal = manifestFixture();
  traversal.assets = [{ path: '../secret.txt' }];
  await assert.rejects(() => importer.import({ manifest: traversal }), /ASSET_PATH_INVALID/);

  const unsafeUrl = manifestFixture();
  unsafeUrl.assets = [{ fileName: 'payload.svg', url: 'javascript:alert(1)' }];
  await assert.rejects(() => importer.import({ manifest: unsafeUrl }), /ASSET_URL_INVALID/);
});

test('static site asset importer keeps application release revisions distinct', () => {
  const first = manifestFixture();
  const second = manifestFixture();
  second.assets[1].artifact.version = '1.2.4';

  const firstPlan = importer._internals.buildPlan(first);
  const secondPlan = importer._internals.buildPlan(second);

  assert.notStrictEqual(firstPlan.assets[1].sourceId, secondPlan.assets[1].sourceId);
});

test('static site asset importer can be invoked through the importer module', async () => {
  const moduleFactory = require('../mother/modules/importer');
  const emitter = new EventEmitter();
  emitter.registerModuleType = () => {};
  await moduleFactory.initialize({ motherEmitter: emitter, isCore: true, jwt: 'core-token' });

  const importers = await emitAsync(emitter, 'listImporters', {
    jwt: 'core-token',
    moduleName: 'importer',
    moduleType: 'core',
    decodedJWT: { permissions: { importers: { list: true } } }
  });

  assert(importers.includes('staticSiteAssets'));
});

test('importer boundary rejects static site manifests outside staging roots', async () => {
  const moduleFactory = require('../mother/modules/importer');
  const emitter = new EventEmitter();
  emitter.registerModuleType = () => {};
  await moduleFactory.initialize({ motherEmitter: emitter, isCore: true, jwt: 'core-token' });

  await assert.rejects(() => emitAsync(emitter, 'runImport', {
    jwt: 'core-token',
    moduleName: 'importer',
    moduleType: 'core',
    decodedJWT: { permissions: { importers: { run: true } } },
    importerName: 'staticSiteAssets',
    options: { filePath: path.join(os.tmpdir(), 'outside-static-site-assets.json') }
  }), /must be inside an import staging root/);
});
