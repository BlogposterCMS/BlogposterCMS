const assert = require('assert');
const EventEmitter = require('events');

const { setupNavigationEvents, _internals } = require('../mother/modules/navigationManager');

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

test('upsertNavigationMenu normalizes menu keys and location keys', async () => {
  const emitter = new EventEmitter();
  setupNavigationEvents(emitter);

  let dbPayload = null;
  emitter.on('dbUpdate', (payload, cb) => {
    dbPayload = payload;
    cb(null, { id: 1, key: payload.data.params.key });
  });

  const { err, result } = await emitAsync(emitter, 'upsertNavigationMenu', {
    jwt: 't',
    moduleName: 'navigationManager',
    moduleType: 'core',
    decodedJWT: { permissions: { navigation: { manage: true } } },
    label: 'Main Menu',
    locationKey: 'Primary Header'
  });

  assert.ifError(err);
  assert.strictEqual(result.key, 'main-menu');
  assert.strictEqual(dbPayload.data.rawSQL, 'UPSERT_NAVIGATION_MENU');
  assert.strictEqual(dbPayload.data.params.key, 'main-menu');
  assert.strictEqual(dbPayload.data.params.locationKey, 'primary-header');
});

test('addNavigationMenuItem resolves menu refs and blocks unsafe urls', async () => {
  const emitter = new EventEmitter();
  setupNavigationEvents(emitter);

  let updatePayload = null;
  emitter.on('dbSelect', (payload, cb) => {
    if (payload.data.rawSQL === 'GET_NAVIGATION_MENU') {
      return cb(null, { id: 4, key: 'primary' });
    }
    cb(null, null);
  });
  emitter.on('dbUpdate', (payload, cb) => {
    updatePayload = payload;
    cb(null, { id: 9, menu_id: payload.data.params.menuId });
  });

  const { err, result } = await emitAsync(emitter, 'addNavigationMenuItem', {
    jwt: 't',
    moduleName: 'navigationManager',
    moduleType: 'core',
    decodedJWT: { permissions: { navigation: { manage: true } } },
    menuKey: 'primary',
    title: 'Bad link',
    url: 'javascript:alert(1)',
    position: 2
  });

  assert.ifError(err);
  assert.strictEqual(result.id, 9);
  assert.strictEqual(updatePayload.data.rawSQL, 'ADD_NAVIGATION_MENU_ITEM');
  assert.strictEqual(updatePayload.data.params.menuId, 4);
  assert.strictEqual(updatePayload.data.params.url, '');
  assert.strictEqual(updatePayload.data.params.position, 2);
});

test('getNavigationTree returns only active items for non-managers', async () => {
  const emitter = new EventEmitter();
  setupNavigationEvents(emitter);

  let listPayload = null;
  emitter.on('dbSelect', (payload, cb) => {
    if (payload.data.rawSQL === 'GET_NAVIGATION_MENU') {
      return cb(null, { id: 4, key: 'primary' });
    }
    if (payload.data.rawSQL === 'LIST_NAVIGATION_MENU_ITEMS') {
      listPayload = payload;
      return cb(null, [
        { id: 2, menu_id: 4, parent_id: 1, title: 'Child', position: 1, meta: {} },
        { id: 1, menu_id: 4, parent_id: null, title: 'Parent', position: 0, meta: {} }
      ]);
    }
    cb(null, null);
  });

  const { err } = await emitAsync(emitter, 'getNavigationTree', {
    jwt: 't',
    moduleName: 'navigationManager',
    moduleType: 'core',
    decodedJWT: { permissions: { navigation: { view: true } } },
    menuKey: 'primary',
    status: 'hidden'
  });

  assert.ok(err);
  assert.match(err.message, /navigation\.manage/);

  const allowed = await emitAsync(emitter, 'getNavigationTree', {
    jwt: 't',
    moduleName: 'navigationManager',
    moduleType: 'core',
    decodedJWT: { permissions: { navigation: { view: true } } },
    menuKey: 'primary'
  });

  assert.ifError(allowed.err);
  assert.strictEqual(listPayload.data.params.status, 'active');
  assert.strictEqual(allowed.result.tree.length, 1);
  assert.strictEqual(allowed.result.tree[0].children[0].title, 'Child');
});

test('navigation internals build stable nested trees', () => {
  const tree = _internals.buildTree([
    { id: 3, parent_id: 1, title: 'B', position: 2 },
    { id: 1, parent_id: null, title: 'Root', position: 0 },
    { id: 2, parent_id: 1, title: 'A', position: 1 }
  ]);

  assert.strictEqual(tree.length, 1);
  assert.deepStrictEqual(tree[0].children.map(item => item.title), ['A', 'B']);
  assert.strictEqual(_internals.normalizeUrl('data:text/html,hi'), '');
  assert.strictEqual(_internals.normalizeUrl('ftp://example.test/file'), '');
  assert.strictEqual(_internals.normalizeUrl('java\nscript:alert(1)'), '');
  assert.strictEqual(_internals.normalizeUrl('//example.test/path'), '');
  assert.strictEqual(_internals.normalizeUrl('about'), '/about');
  assert.strictEqual(_internals.normalizeUrl('https://example.test/about'), 'https://example.test/about');
  assert.strictEqual(_internals.normalizeUrl('mailto:hello@example.test'), 'mailto:hello@example.test');
});
