const assert = require('assert');
const EventEmitter = require('events');

const { setupCommentsEvents, _internals } = require('../mother/modules/commentsManager');

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

test('createComment normalizes target, status and author metadata', async () => {
  const emitter = new EventEmitter();
  setupCommentsEvents(emitter);

  let dbPayload = null;
  emitter.on('dbUpdate', (payload, cb) => {
    dbPayload = payload;
    cb(null, {
      id: 1,
      source_module: payload.data.params.sourceModule,
      source_id: payload.data.params.sourceId,
      status: payload.data.params.status
    });
  });

  const { err, result } = await emitAsync(emitter, 'createComment', {
    jwt: 't',
    moduleName: 'commentsManager',
    moduleType: 'core',
    decodedJWT: { permissions: { comments: { create: true } } },
    sourceModule: 'pagesManager',
    sourceId: 7,
    authorName: '  Ada  ',
    authorEmail: 'ADA@EXAMPLE.COM ',
    authorUrl: 'javascript:alert(1)',
    authorIp: '127.0.0.1',
    userAgent: ' Browser' + String.fromCharCode(0) + ' Agent ',
    content: '  Looks good.  ',
    status: 'approved',
    meta: JSON.parse('{"safe":"yes","__proto__":{"polluted":true},"nested":{"constructor":"drop","keep":"value"},"list":["tag",null]}')
  });

  assert.ifError(err);
  assert.strictEqual(result.status, 'pending');
  assert.strictEqual(dbPayload.data.rawSQL, 'CREATE_COMMENT');
  assert.strictEqual(dbPayload.data.params.sourceModule, 'pagesManager');
  assert.strictEqual(dbPayload.data.params.sourceId, '7');
  assert.strictEqual(dbPayload.data.params.authorName, 'Ada');
  assert.strictEqual(dbPayload.data.params.authorEmail, 'ada@example.com');
  assert.strictEqual(dbPayload.data.params.authorUrl, '');
  assert.strictEqual(dbPayload.data.params.userAgent, 'Browser Agent');
  assert.strictEqual(dbPayload.data.params.content, 'Looks good.');
  assert.strictEqual(dbPayload.data.params.authorIpHash.length, 64);
  assert.deepStrictEqual(dbPayload.data.params.meta, {
    safe: 'yes',
    nested: { keep: 'value' },
    list: ['tag', null]
  });
  assert.strictEqual({}.polluted, undefined);
});

test('listCommentsForEntry limits non-moderators to approved comments', async () => {
  const emitter = new EventEmitter();
  setupCommentsEvents(emitter);

  let dbPayload = null;
  emitter.on('dbSelect', (payload, cb) => {
    dbPayload = payload;
    cb(null, []);
  });

  const { err } = await emitAsync(emitter, 'listCommentsForEntry', {
    jwt: 't',
    moduleName: 'commentsManager',
    moduleType: 'core',
    decodedJWT: { permissions: { comments: { create: true } } },
    entryId: 22,
    status: 'spam'
  });

  assert.ifError(err);
  assert.strictEqual(dbPayload.data.rawSQL, 'LIST_COMMENTS_FOR_ENTRY');
  assert.strictEqual(dbPayload.data.params.entryId, '22');
  assert.strictEqual(dbPayload.data.params.status, 'approved');
});

test('updateCommentStatus requires moderation permission', async () => {
  const emitter = new EventEmitter();
  setupCommentsEvents(emitter);

  const denied = await emitAsync(emitter, 'updateCommentStatus', {
    jwt: 't',
    moduleName: 'commentsManager',
    moduleType: 'core',
    decodedJWT: { permissions: { comments: { create: true } } },
    commentId: 3,
    status: 'approved'
  });

  assert.ok(denied.err);
  assert.match(denied.err.message, /comments\.moderate/);

  let dbPayload = null;
  emitter.on('dbUpdate', (payload, cb) => {
    dbPayload = payload;
    cb(null, { id: 3, status: payload.data.params.status });
  });

  const allowed = await emitAsync(emitter, 'updateCommentStatus', {
    jwt: 't',
    moduleName: 'commentsManager',
    moduleType: 'core',
    decodedJWT: { permissions: { comments: { moderate: true } } },
    commentId: 3,
    status: 'approved'
  });

  assert.ifError(allowed.err);
  assert.strictEqual(allowed.result.status, 'approved');
  assert.strictEqual(dbPayload.data.rawSQL, 'UPDATE_COMMENT_STATUS');
  assert.strictEqual(dbPayload.data.params.commentId, '3');
});

test('comment input requires a content target', () => {
  assert.throws(() => {
    _internals.normalizeCommentInput({ content: 'No target' });
  }, /entryId or sourceModule\/sourceId/);
});

test('comment input keeps only safe author urls and object metadata', () => {
  const normalized = _internals.normalizeCommentInput({
    entryId: 44,
    content: 'Hi',
    authorUrl: 'https://example.com/profile?tab=comments#bio',
    meta: JSON.parse('{"ok":"value","prototype":"drop","deep":{"__proto__":{"x":1},"keep":true},"items":["yes",5,null]}')
  });

  assert.strictEqual(normalized.authorUrl, 'https://example.com/profile?tab=comments#bio');
  assert.deepStrictEqual(normalized.meta, {
    ok: 'value',
    deep: { keep: true },
    items: ['yes', 5, null]
  });

  const stripped = _internals.normalizeCommentInput({
    entryId: 44,
    content: 'Hi',
    authorUrl: '//evil.test/profile',
    meta: ['not', 'an', 'object']
  });

  assert.strictEqual(stripped.authorUrl, '');
  assert.deepStrictEqual(stripped.meta, {});
});

test('comment results sanitize legacy urls and metadata before returning', () => {
  const result = _internals.sanitizeCommentResult({
    id: 2,
    author_url: 'data:text/html,owned',
    author_email: ' ADA@EXAMPLE.COM ',
    user_agent: ' Browser' + String.fromCharCode(1) + ' Agent ',
    meta: '{"ok":"yes","constructor":{"polluted":true}}'
  });

  assert.strictEqual(result.author_url, '');
  assert.strictEqual(result.author_email, 'ada@example.com');
  assert.strictEqual(result.user_agent, 'Browser Agent');
  assert.deepStrictEqual(result.meta, { ok: 'yes' });
});

test('comment ids must be scalar values', async () => {
  const emitter = new EventEmitter();
  setupCommentsEvents(emitter);

  const { err } = await emitAsync(emitter, 'getComment', {
    jwt: 't',
    moduleName: 'commentsManager',
    moduleType: 'core',
    commentId: { unsafe: true }
  });

  assert.ok(err);
  assert.match(err.message, /commentId is required/);
});
