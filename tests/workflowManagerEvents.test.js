const assert = require('assert');
const EventEmitter = require('events');

const { setupWorkflowEvents, _internals } = require('../mother/modules/workflowManager');

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

test('acquireContentLock emits normalized lock payloads', async () => {
  const emitter = new EventEmitter();
  setupWorkflowEvents(emitter);

  let dbPayload = null;
  emitter.on('dbUpdate', (payload, cb) => {
    dbPayload = payload;
    cb(null, { id: 1, locked: true, ...payload.data.params });
  });

  const { err, result } = await emitAsync(emitter, 'acquireContentLock', {
    jwt: 't',
    moduleName: 'workflowManager',
    moduleType: 'core',
    decodedJWT: { permissions: { content: { update: true } }, user: { id: 7, username: 'ana' } },
    entryId: 42,
    ttlSeconds: 90,
    meta: JSON.parse('{"safe":"yes","__proto__":{"polluted":true},"nested":{"constructor":"drop","keep":true}}')
  });

  assert.ifError(err);
  assert.strictEqual(dbPayload.data.rawSQL, 'ACQUIRE_CONTENT_LOCK');
  assert.strictEqual(dbPayload.data.params.targetType, 'contentEntry');
  assert.strictEqual(dbPayload.data.params.targetId, '42');
  assert.strictEqual(dbPayload.data.params.ownerId, '7');
  assert.match(dbPayload.data.params.token, /^[a-f0-9]{32}$/);
  assert.deepStrictEqual(dbPayload.data.params.meta, {
    safe: 'yes',
    nested: { keep: true }
  });
  assert.strictEqual(result.locked, true);
  assert.strictEqual({}.polluted, undefined);
});

test('saveContentAutosave stores one target and author scoped draft', async () => {
  const emitter = new EventEmitter();
  setupWorkflowEvents(emitter);

  let dbPayload = null;
  emitter.on('dbUpdate', (payload, cb) => {
    dbPayload = payload;
    cb(null, { id: 1, ...payload.data.params });
  });

  const content = JSON.parse('{"body":"<p>Draft</p>","__proto__":{"polluted":true},"blocks":[{"constructor":"drop","type":"text"}]}');
  content.helper = () => 'ignored';
  const { err, result } = await emitAsync(emitter, 'saveContentAutosave', {
    jwt: 't',
    moduleName: 'workflowManager',
    moduleType: 'core',
    decodedJWT: { permissions: { content: { update: true } }, userId: 9 },
    entryId: 3,
    title: 'Draft',
    content,
    meta: JSON.parse('{"autosave":true,"prototype":"drop","nested":{"__proto__":{"x":1},"keep":"yes"}}')
  });

  assert.ifError(err);
  assert.strictEqual(dbPayload.data.rawSQL, 'UPSERT_CONTENT_AUTOSAVE');
  assert.strictEqual(dbPayload.data.params.authorId, '9');
  assert.deepStrictEqual(dbPayload.data.params.content, {
    body: '<p>Draft</p>',
    blocks: [{ type: 'text' }],
    helper: null
  });
  assert.deepStrictEqual(dbPayload.data.params.meta, {
    autosave: true,
    nested: { keep: 'yes' }
  });
  assert.strictEqual(result.title, 'Draft');
});

test('workflow targets reject object ids and unsafe paths', () => {
  assert.throws(() => {
    _internals.normalizeTarget({ entryId: { id: 1 } });
  }, /Workflow targetId is required/);

  assert.throws(() => {
    _internals.normalizeTarget({ path: 'javascript:alert(1)' });
  }, /unsafe/);

  assert.strictEqual(_internals.normalizeTarget({
    sourceModule: 'pagesManager',
    sourceId: 7
  }).targetId, 'pagesManager:7');
});

test('workflow queries can use ids without target payloads', () => {
  assert.deepStrictEqual(_internals.normalizeAutosaveQuery({ autosaveId: 4 }), {
    id: '4',
    authorId: '',
    limit: 20,
    offset: 0
  });

  assert.deepStrictEqual(_internals.normalizeReviewQuery({ reviewId: 8, limit: -10, offset: -5 }), {
    id: '8',
    status: '',
    submittedBy: '',
    reviewerId: '',
    limit: 50,
    offset: 0
  });
});

test('submitContentReview creates queue item and updates content status', async () => {
  const emitter = new EventEmitter();
  setupWorkflowEvents(emitter);

  const updates = [];
  emitter.on('dbUpdate', (payload, cb) => {
    updates.push(payload);
    cb(null, { id: 2, ...payload.data.params });
  });
  emitter.on('updateContentEntry', (payload, cb) => {
    updates.push({ eventName: 'updateContentEntry', payload });
    cb(null, { done: true, entryId: payload.entryId, status: payload.status });
  });

  const { err, result } = await emitAsync(emitter, 'submitContentReview', {
    jwt: 't',
    moduleName: 'workflowManager',
    moduleType: 'core',
    decodedJWT: { permissions: { content: { update: true } }, userId: 5 },
    entryId: 77,
    note: 'Ready',
    meta: JSON.parse('{"review":"yes","constructor":"drop"}')
  });

  assert.ifError(err);
  assert.strictEqual(updates[0].data.rawSQL, 'UPSERT_CONTENT_REVIEW');
  assert.strictEqual(updates[0].data.params.status, 'pending');
  assert.deepStrictEqual(updates[0].data.params.meta, { review: 'yes' });
  assert.strictEqual(updates[1].eventName, 'updateContentEntry');
  assert.strictEqual(updates[1].payload.moduleName, 'contentEngine');
  assert.strictEqual(updates[1].payload.status, 'review');
  assert.strictEqual(result.contentUpdate.status, 'review');
});

test('approveContentReview marks review approved and publishes content', async () => {
  const emitter = new EventEmitter();
  setupWorkflowEvents(emitter);

  const updates = [];
  emitter.on('dbUpdate', (payload, cb) => {
    updates.push(payload);
    cb(null, { id: 2, ...payload.data.params });
  });
  emitter.on('publishContentEntry', (payload, cb) => {
    updates.push({ eventName: 'publishContentEntry', payload });
    cb(null, { done: true, entryId: payload.entryId, status: 'published' });
  });

  const { err, result } = await emitAsync(emitter, 'approveContentReview', {
    jwt: 't',
    moduleName: 'workflowManager',
    moduleType: 'core',
    decodedJWT: { permissions: { content: { publish: true } }, userId: 10 },
    entryId: 77,
    note: 'Looks good'
  });

  assert.ifError(err);
  assert.strictEqual(updates[0].data.rawSQL, 'UPDATE_CONTENT_REVIEW_STATUS');
  assert.strictEqual(updates[0].data.params.status, 'approved');
  assert.strictEqual(updates[0].data.params.reviewerId, '10');
  assert.strictEqual(updates[1].eventName, 'publishContentEntry');
  assert.strictEqual(result.contentUpdate.status, 'published');
});

test('workflow internals normalize targets and review payloads', () => {
  const lock = _internals.normalizeLock({
    entryId: 1,
    userId: 2,
    userName: 'Editor',
    ttlSeconds: 30
  });
  assert.strictEqual(lock.targetType, 'contentEntry');
  assert.strictEqual(lock.targetId, '1');
  assert.strictEqual(lock.ownerId, '2');
  assert.match(lock.expiresAt, /^\d{4}-/);

  const review = _internals.normalizeReview({
    sourceModule: 'pagesManager',
    sourceId: 'home',
    userId: 9
  });
  assert.strictEqual(review.targetType, 'source');
  assert.strictEqual(review.targetId, 'pagesManager:home');
  assert.strictEqual(review.status, 'pending');
});
