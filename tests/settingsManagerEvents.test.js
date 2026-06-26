'use strict';

const assert = require('assert');
const EventEmitter = require('events');
const { setupSettingsListeners } = require('../mother/modules/settingsManager');

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

test('settings manager exposes option, list, bulk and delete events', async () => {
  const emitter = new EventEmitter();
  setupSettingsListeners(emitter);

  const selects = [];
  const updates = [];
  const deletes = [];

  emitter.on('dbSelect', (payload, cb) => {
    selects.push(payload);
    if (payload.data.rawSQL === 'GET_SETTING') {
      return cb(null, [{ value: `value:${payload.data.key}` }]);
    }
    if (payload.data.rawSQL === 'LIST_SETTINGS') {
      const keys = payload.data.keys || ['SITE_TITLE'];
      return cb(null, keys.map(key => ({ key, value: `value:${key}` })));
    }
    return cb(null, []);
  });
  emitter.on('dbUpdate', (payload, cb) => {
    updates.push(payload);
    cb(null, { done: true, key: payload.data.key, value: payload.data.value });
  });
  emitter.on('dbDelete', (payload, cb) => {
    deletes.push(payload);
    cb(null, { done: true, key: payload.where.key });
  });

  const base = {
    jwt: 'token',
    moduleName: 'settingsManager',
    moduleType: 'core',
    decodedJWT: { permissions: { settings: { core: { view: true, edit: true } } } }
  };

  const option = await emitAsync(emitter, 'getOption', { ...base, key: 'SITE_TITLE' });
  assert.ifError(option.err);
  assert.strictEqual(option.result, 'value:SITE_TITLE');
  assert.strictEqual(selects[0].data.rawSQL, 'GET_SETTING');

  const listed = await emitAsync(emitter, 'listSettings', { ...base, prefix: 'seo.' });
  assert.ifError(listed.err);
  assert.strictEqual(selects[1].data.rawSQL, 'LIST_SETTINGS');
  assert.strictEqual(selects[1].data.prefix, 'seo.');

  const publicSettings = await emitAsync(emitter, 'getPublicSettings', { ...base, keys: ['SITE_TITLE'] });
  assert.ifError(publicSettings.err);
  assert.deepStrictEqual(publicSettings.result, { SITE_TITLE: 'value:SITE_TITLE' });
  assert.deepStrictEqual(selects[2].data.keys, ['SITE_TITLE']);

  const updated = await emitAsync(emitter, 'updateOption', { ...base, key: 'SITE_TITLE', value: 'Blogposter' });
  assert.ifError(updated.err);
  assert.strictEqual(updates[0].data.rawSQL, 'UPSERT_SETTING');
  assert.strictEqual(updates[0].data.value, 'Blogposter');

  const bulk = await emitAsync(emitter, 'setSettings', {
    ...base,
    settings: {
      SITE_TITLE: 'Blogposter',
      POSTS_PER_PAGE: '10'
    }
  });
  assert.ifError(bulk.err);
  assert.strictEqual(bulk.result.done, true);
  assert.strictEqual(updates[1].data.key, 'SITE_TITLE');
  assert.strictEqual(updates[2].data.key, 'POSTS_PER_PAGE');

  const deleted = await emitAsync(emitter, 'deleteOption', { ...base, key: 'OLD_OPTION' });
  assert.ifError(deleted.err);
  assert.strictEqual(deletes[0].where.rawSQL, 'DELETE_SETTING');
  assert.strictEqual(deletes[0].where.key, 'OLD_OPTION');
});

test('settings manager public events reject private keys', async () => {
  const emitter = new EventEmitter();
  setupSettingsListeners(emitter);

  const result = await emitAsync(emitter, 'getPublicSetting', {
    jwt: 'token',
    moduleName: 'settingsManager',
    moduleType: 'core',
    key: 'JWT_SECRET'
  });

  assert(result.err);
  assert.match(result.err.message, /key not allowed/);
});
