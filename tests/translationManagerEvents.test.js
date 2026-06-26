'use strict';

const assert = require('assert');
const EventEmitter = require('events');
const {
  setupTranslationCrudEvents,
  _internals
} = require('../mother/modules/translationManager/translationCrudEvents');

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

test('translation text events emit normalized placeholders', async () => {
  const emitter = new EventEmitter();
  setupTranslationCrudEvents(emitter);

  const selects = [];
  const updates = [];
  const deletes = [];

  emitter.on('dbSelect', (payload, cb) => {
    selects.push(payload);
    cb(null, [{ id: 3, text_value: 'Hallo', language_code: payload.data.params.languageCode || 'de' }]);
  });
  emitter.on('dbUpdate', (payload, cb) => {
    updates.push(payload);
    cb(null, { id: 3, text_value: payload.data.params.textValue, language_code: payload.data.params.languageCode });
  });
  emitter.on('dbDelete', (payload, cb) => {
    deletes.push(payload);
    cb(null, { done: true });
  });

  const base = {
    jwt: 'token',
    moduleName: 'translationManager',
    moduleType: 'core',
    decodedJWT: {
      permissions: {
        translations: {
          create: true,
          read: true,
          update: true,
          delete: true
        }
      }
    }
  };

  const created = await emitAsync(emitter, 'createTranslatedText', {
    ...base,
    objectId: 'entry-1',
    fieldName: 'title',
    languageCode: 'DE_de',
    textValue: 'Hallo'
  });
  assert.ifError(created.err);
  assert.strictEqual(updates[0].data.rawSQL, 'UPSERT_TRANSLATED_TEXT');
  assert.strictEqual(updates[0].data.params.objectId, 'entry-1');
  assert.strictEqual(updates[0].data.params.fieldName, 'title');
  assert.strictEqual(updates[0].data.params.languageCode, 'de_de');

  const listed = await emitAsync(emitter, 'listTranslatedTexts', {
    ...base,
    objectId: 'entry-1',
    language: 'de',
    limit: 12,
    offset: 2
  });
  assert.ifError(listed.err);
  assert.strictEqual(selects[0].data.rawSQL, 'LIST_TRANSLATED_TEXTS');
  assert.strictEqual(selects[0].data.params.languageCode, 'de');
  assert.strictEqual(selects[0].data.params.limit, 12);

  const loaded = await emitAsync(emitter, 'getTranslatedText', {
    ...base,
    objectId: 'entry-1',
    fieldName: 'title',
    languageCode: 'de'
  });
  assert.ifError(loaded.err);
  assert.strictEqual(selects[1].data.rawSQL, 'GET_TRANSLATED_TEXT');

  const updated = await emitAsync(emitter, 'updateTranslatedText', {
    ...base,
    textId: 3,
    newTextValue: ''
  });
  assert.ifError(updated.err);
  assert.strictEqual(updates[1].data.rawSQL, 'UPDATE_TRANSLATED_TEXT');
  assert.strictEqual(updates[1].data.params.textId, 3);
  assert.strictEqual(updates[1].data.params.textValue, '');

  const deleted = await emitAsync(emitter, 'deleteTranslatedText', {
    ...base,
    textId: 3
  });
  assert.ifError(deleted.err);
  assert.strictEqual(deletes[0].where.rawSQL, 'DELETE_TRANSLATED_TEXT');
  assert.strictEqual(deletes[0].where.params.textId, 3);
});

test('translation language events emit normalized placeholders', async () => {
  const emitter = new EventEmitter();
  setupTranslationCrudEvents(emitter);

  const selects = [];
  const updates = [];
  const deletes = [];

  emitter.on('dbSelect', (payload, cb) => {
    selects.push(payload);
    cb(null, [{ language_code: payload.data.params.languageCode || 'de', language_name: 'Deutsch' }]);
  });
  emitter.on('dbUpdate', (payload, cb) => {
    updates.push(payload);
    cb(null, { language_code: payload.data.params.languageCode, language_name: payload.data.params.languageName });
  });
  emitter.on('dbDelete', (payload, cb) => {
    deletes.push(payload);
    cb(null, { done: true });
  });

  const base = {
    jwt: 'token',
    moduleName: 'translationManager',
    moduleType: 'core',
    decodedJWT: {
      permissions: {
        translations: {
          addLanguage: true,
          listLanguages: true,
          delete: true
        }
      }
    }
  };

  const added = await emitAsync(emitter, 'addLanguage', {
    ...base,
    languageCode: 'DE',
    languageName: 'Deutsch',
    textDirection: 'ltr'
  });
  assert.ifError(added.err);
  assert.strictEqual(updates[0].data.rawSQL, 'UPSERT_TRANSLATION_LANGUAGE');
  assert.strictEqual(updates[0].data.params.languageCode, 'de');

  const list = await emitAsync(emitter, 'listLanguages', { ...base, active: true });
  assert.ifError(list.err);
  assert.strictEqual(selects[0].data.rawSQL, 'LIST_TRANSLATION_LANGUAGES');
  assert.strictEqual(selects[0].data.params.active, true);

  const loaded = await emitAsync(emitter, 'getTranslationLanguage', { ...base, languageCode: 'de' });
  assert.ifError(loaded.err);
  assert.strictEqual(selects[1].data.rawSQL, 'GET_TRANSLATION_LANGUAGE');
  assert.strictEqual(selects[1].data.params.languageCode, 'de');

  const deleted = await emitAsync(emitter, 'deleteTranslationLanguage', { ...base, languageCode: 'de' });
  assert.ifError(deleted.err);
  assert.strictEqual(deletes[0].where.rawSQL, 'DELETE_TRANSLATION_LANGUAGE');
  assert.strictEqual(deletes[0].where.params.languageCode, 'de');
});

test('translation text events sanitize metadata and scalar references', async () => {
  const emitter = new EventEmitter();
  setupTranslationCrudEvents(emitter);

  const updates = [];
  emitter.on('dbUpdate', (payload, cb) => {
    updates.push(payload);
    cb(null, { ok: true });
  });

  const base = {
    jwt: 'token',
    moduleName: 'translationManager',
    moduleType: 'core',
    decodedJWT: {
      permissions: {
        translations: { update: true }
      }
    }
  };

  const updated = await emitAsync(emitter, 'upsertTranslatedText', {
    ...base,
    objectId: 'entry-1',
    fieldName: 'title',
    languageCode: 'DE',
    textValue: 'Hallo\u0000 Welt',
    meta: JSON.parse('{"safe":true,"__proto__":{"polluted":true},"nested":{"constructor":{"bad":true},"ok":1}}')
  });

  assert.ifError(updated.err);
  assert.strictEqual(updates[0].data.params.textValue, 'Hallo  Welt');
  assert.deepStrictEqual(updates[0].data.params.meta, {
    safe: true,
    nested: { ok: 1 }
  });
  assert.strictEqual({}.polluted, undefined);

  const badRef = await emitAsync(emitter, 'upsertTranslatedText', {
    ...base,
    objectId: { id: 'entry-1' },
    fieldName: 'title',
    languageCode: 'de',
    textValue: 'Hallo'
  });
  assert(badRef.err);
  assert.match(badRef.err.message, /textId or objectId\/fieldName\/languageCode/);
});

test('translation list inputs are bounded at the event boundary', async () => {
  const emitter = new EventEmitter();
  setupTranslationCrudEvents(emitter);

  const selects = [];
  emitter.on('dbSelect', (payload, cb) => {
    selects.push(payload);
    cb(null, []);
  });

  const listed = await emitAsync(emitter, 'listTranslatedTexts', {
    jwt: 'token',
    moduleName: 'translationManager',
    moduleType: 'core',
    decodedJWT: {
      permissions: {
        translations: { read: true }
      }
    },
    objectId: 'entry-1',
    limit: -50,
    offset: -10
  });

  assert.ifError(listed.err);
  assert.strictEqual(selects[0].data.params.limit, 1);
  assert.strictEqual(selects[0].data.params.offset, 0);
  assert.strictEqual(_internals.normalizeListLimit(9999), 200);
  assert.strictEqual(_internals.normalizeScalarId({ id: 'x' }), '');
});

test('translation manager initializer enforces core module loading', async () => {
  jest.resetModules();
  const translationManager = require('../mother/modules/translationManager');
  const emitter = new EventEmitter();
  emitter.registered = [];
  emitter.registerModuleType = (moduleName, moduleType) => {
    emitter.registered.push({ moduleName, moduleType });
  };

  await assert.rejects(
    () => translationManager.initialize({ motherEmitter: emitter, isCore: false, jwt: 'token' }),
    /core module/
  );
  assert.deepStrictEqual(emitter.registered, []);
});
