const assert = require('assert');
const crypto = require('crypto');
const EventEmitter = require('events');

const originalPrivateKey = process.env.APP_FRAME_ORIGIN_TOKEN_PRIVATE_KEY;
const originalPublicKey = process.env.APP_FRAME_ORIGIN_TOKEN_PUBLIC_KEY;
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.APP_FRAME_ORIGIN_TOKEN_PRIVATE_KEY = privateKey
  .export({ type: 'pkcs8', format: 'pem' })
  .toString();
process.env.APP_FRAME_ORIGIN_TOKEN_PUBLIC_KEY = publicKey
  .export({ type: 'spki', format: 'pem' })
  .toString();

const mediaManager = require('../mother/modules/mediaManager');
const { setupMediaMetadataEvents, _internals } = mediaManager;

afterAll(() => {
  if (originalPrivateKey === undefined) {
    delete process.env.APP_FRAME_ORIGIN_TOKEN_PRIVATE_KEY;
  } else {
    process.env.APP_FRAME_ORIGIN_TOKEN_PRIVATE_KEY = originalPrivateKey;
  }
  if (originalPublicKey === undefined) {
    delete process.env.APP_FRAME_ORIGIN_TOKEN_PUBLIC_KEY;
  } else {
    process.env.APP_FRAME_ORIGIN_TOKEN_PUBLIC_KEY = originalPublicKey;
  }
});

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

test('createMediaAttachment normalizes attachment metadata', async () => {
  const emitter = new EventEmitter();
  setupMediaMetadataEvents(emitter);

  let dbPayload = null;
  emitter.on('dbUpdate', (payload, cb) => {
    dbPayload = payload;
    cb(null, { id: 1, ...payload.data.params });
  });

  const { err, result } = await emitAsync(emitter, 'createMediaAttachment', {
    jwt: 't',
    moduleName: 'mediaManager',
    moduleType: 'core',
    decodedJWT: { permissions: { media: { manage: true } } },
    fileName: 'Hero Image.PNG',
    mimeType: 'image/png',
    storagePath: './uploads/hero.png',
    altText: 'Hero',
    caption: 'Launch',
    width: 1200,
    height: 800,
    sourceModule: 'contentEngine',
    sourceId: 7
  });

  assert.ifError(err);
  assert.strictEqual(dbPayload.data.rawSQL, 'UPSERT_MEDIA_ATTACHMENT');
  assert.strictEqual(dbPayload.data.params.fileName, 'Hero Image.PNG');
  assert.strictEqual(dbPayload.data.params.fileType, 'image');
  assert.strictEqual(dbPayload.data.params.storagePath, 'uploads/hero.png');
  assert.strictEqual(dbPayload.data.params.altText, 'Hero');
  assert.strictEqual(dbPayload.data.params.visibility, 'public');
  assert.strictEqual(result.width, 1200);
});

test('listMediaAttachments limits non-managers to public active attachments', async () => {
  const emitter = new EventEmitter();
  setupMediaMetadataEvents(emitter);

  let dbPayload = null;
  emitter.on('dbSelect', (payload, cb) => {
    dbPayload = payload;
    cb(null, []);
  });

  const { err } = await emitAsync(emitter, 'listMediaAttachments', {
    jwt: 't',
    moduleName: 'mediaManager',
    moduleType: 'core',
    decodedJWT: { permissions: { media: { view: true } } },
    status: 'archived',
    visibility: 'private',
    query: 'hero'
  });

  assert.ifError(err);
  assert.strictEqual(dbPayload.data.rawSQL, 'LIST_MEDIA_ATTACHMENTS');
  assert.strictEqual(dbPayload.data.params.status, 'active');
  assert.strictEqual(dbPayload.data.params.visibility, 'public');
  assert.strictEqual(dbPayload.data.params.query, 'hero');
});

test('listMediaAttachments clamps pagination at the event boundary', async () => {
  const emitter = new EventEmitter();
  setupMediaMetadataEvents(emitter);

  let dbPayload = null;
  emitter.on('dbSelect', (payload, cb) => {
    dbPayload = payload;
    cb(null, []);
  });

  const { err } = await emitAsync(emitter, 'listMediaAttachments', {
    jwt: 't',
    moduleName: 'mediaManager',
    moduleType: 'core',
    decodedJWT: { permissions: { media: { manage: true } } },
    limit: -10,
    offset: -5
  });

  assert.ifError(err);
  assert.strictEqual(dbPayload.data.params.limit, 1);
  assert.strictEqual(dbPayload.data.params.offset, 0);
  assert.strictEqual(_internals.normalizeListLimit(9999), 200);
});

test('updateMediaAttachment keeps omitted fields out of partial updates', async () => {
  const emitter = new EventEmitter();
  setupMediaMetadataEvents(emitter);

  let dbPayload = null;
  emitter.on('dbUpdate', (payload, cb) => {
    dbPayload = payload;
    cb(null, { id: payload.data.params.id, caption: payload.data.params.caption });
  });

  const { err, result } = await emitAsync(emitter, 'updateMediaAttachment', {
    jwt: 't',
    moduleName: 'mediaManager',
    moduleType: 'core',
    decodedJWT: { permissions: { media: { manage: true } } },
    id: 7,
    caption: 'Only this changes'
  });

  assert.ifError(err);
  assert.strictEqual(dbPayload.data.rawSQL, 'UPSERT_MEDIA_ATTACHMENT');
  assert.strictEqual(dbPayload.data.params.id, 7);
  assert.strictEqual(dbPayload.data.params.caption, 'Only this changes');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(dbPayload.data.params, 'status'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(dbPayload.data.params, 'visibility'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(dbPayload.data.params, 'fileName'), false);
  assert.strictEqual(result.caption, 'Only this changes');
});

test('media variants and content links emit normalized placeholders', async () => {
  const emitter = new EventEmitter();
  setupMediaMetadataEvents(emitter);

  const updates = [];
  emitter.on('dbUpdate', (payload, cb) => {
    updates.push(payload);
    cb(null, { id: updates.length, ...payload.data.params });
  });

  const variant = await emitAsync(emitter, 'upsertMediaVariant', {
    jwt: 't',
    moduleName: 'mediaManager',
    moduleType: 'core',
    decodedJWT: { permissions: { media: { manage: true } } },
    attachmentId: 9,
    variantKey: 'Thumbnail 320',
    storagePath: 'thumbs/hero.png',
    width: 320,
    height: 180
  });
  const link = await emitAsync(emitter, 'linkMediaToContent', {
    jwt: 't',
    moduleName: 'mediaManager',
    moduleType: 'core',
    decodedJWT: { permissions: { media: { manage: true } } },
    attachmentId: 9,
    entryId: 44,
    role: 'featured-image',
    sortOrder: 1
  });

  assert.ifError(variant.err);
  assert.ifError(link.err);
  assert.strictEqual(updates[0].data.rawSQL, 'UPSERT_MEDIA_VARIANT');
  assert.strictEqual(updates[0].data.params.variantKey, 'thumbnail-320');
  assert.strictEqual(updates[1].data.rawSQL, 'LINK_MEDIA_ATTACHMENT');
  assert.strictEqual(updates[1].data.params.targetType, 'contentEntry');
  assert.strictEqual(updates[1].data.params.targetId, '44');
  assert.strictEqual(updates[1].data.params.role, 'featured-image');
});

test('media metadata events sanitize json metadata and reject object ids', async () => {
  const emitter = new EventEmitter();
  setupMediaMetadataEvents(emitter);

  const updates = [];
  emitter.on('dbUpdate', (payload, cb) => {
    updates.push(payload);
    cb(null, { id: updates.length, ...payload.data.params });
  });

  const attachment = await emitAsync(emitter, 'createMediaAttachment', {
    jwt: 't',
    moduleName: 'mediaManager',
    moduleType: 'core',
    decodedJWT: { permissions: { media: { manage: true } } },
    fileName: 'hero.png',
    meta: JSON.parse('{"safe":true,"__proto__":{"polluted":true},"nested":{"constructor":{"bad":true},"ok":1}}')
  });
  assert.ifError(attachment.err);
  assert.deepStrictEqual(updates[0].data.params.meta, {
    safe: true,
    nested: { ok: 1 }
  });
  assert.strictEqual({}.polluted, undefined);

  const variant = await emitAsync(emitter, 'upsertMediaVariant', {
    jwt: 't',
    moduleName: 'mediaManager',
    moduleType: 'core',
    decodedJWT: { permissions: { media: { manage: true } } },
    attachmentId: { id: 1 },
    variantKey: 'thumb'
  });
  assert(variant.err);
  assert.match(variant.err.message, /attachmentId/);
  assert.strictEqual(_internals.normalizeScalarId({ id: 1 }), '');
});

test('deleteMediaAttachment resolves source keys before deleting', async () => {
  const emitter = new EventEmitter();
  setupMediaMetadataEvents(emitter);

  const calls = [];
  emitter.on('dbSelect', (payload, cb) => {
    calls.push(payload);
    cb(null, { id: 12 });
  });
  emitter.on('dbUpdate', (payload, cb) => {
    calls.push(payload);
    cb(null, { done: true, id: payload.data.params.id });
  });

  const { err, result } = await emitAsync(emitter, 'deleteMediaAttachment', {
    jwt: 't',
    moduleName: 'mediaManager',
    moduleType: 'core',
    decodedJWT: { permissions: { media: { manage: true } } },
    sourceModule: 'pagesManager',
    sourceId: 'hero'
  });

  assert.ifError(err);
  assert.strictEqual(calls[0].data.rawSQL, 'GET_MEDIA_ATTACHMENT');
  assert.strictEqual(calls[1].data.rawSQL, 'DELETE_MEDIA_ATTACHMENT');
  assert.strictEqual(calls[1].data.params.id, 12);
  assert.strictEqual(result.id, 12);
});

test('media internals normalize paths, targets and unsafe urls', () => {
  assert.strictEqual(_internals.normalizeLibraryPath('../uploads//hero.png'), 'uploads/hero.png');
  assert.strictEqual(_internals.normalizePublicUrl('javascript:alert(1)'), '');
  assert.strictEqual(_internals.normalizeMediaVariant({
    attachmentId: 3,
    variantKey: 'Large Image',
    storagePath: './large.png'
  }).variantKey, 'large-image');
  assert.deepStrictEqual(_internals.normalizeMediaTarget({
    attachmentId: 3,
    entryId: 8
  }), {
    attachmentId: 3,
    targetType: 'contentEntry',
    targetId: '8',
    sourceModule: 'contentEngine',
    sourceId: '8',
    role: 'inline',
    sortOrder: 0,
    meta: {}
  });
});

test('media manager initializer enforces core module loading', async () => {
  const emitter = new EventEmitter();
  emitter.registered = [];
  emitter.registerModuleType = (moduleName, moduleType) => {
    emitter.registered.push({ moduleName, moduleType });
  };

  await assert.rejects(
    () => mediaManager.initialize({ motherEmitter: emitter, isCore: false, jwt: 't' }),
    /core module/
  );
  assert.deepStrictEqual(emitter.registered, []);
  assert.strictEqual(mediaManager.MODULE_NAME, 'mediaManager');
  assert.strictEqual(mediaManager.MODULE_TYPE, 'core');
});
