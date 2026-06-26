'use strict';

const assert = require('assert');
const EventEmitter = require('events');
const {
  initSettingsRegistry,
  _internals
} = require('../mother/modules/unifiedSettings/settingsRegistryService');

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

function setupSettingsStore(emitter) {
  const store = {};
  const calls = [];

  emitter.on('getSetting', (payload, cb) => {
    calls.push({ eventName: 'getSetting', payload });
    cb(null, Object.prototype.hasOwnProperty.call(store, payload.key) ? store[payload.key] : null);
  });
  emitter.on('setSetting', (payload, cb) => {
    calls.push({ eventName: 'setSetting', payload });
    store[payload.key] = payload.value;
    cb(null, { done: true, key: payload.key });
  });
  emitter.on('setSettings', (payload, cb) => {
    calls.push({ eventName: 'setSettings', payload });
    Object.assign(store, payload.settings || {});
    cb(null, { done: true });
  });
  emitter.on('listSettings', (payload, cb) => {
    calls.push({ eventName: 'listSettings', payload });
    const prefix = payload.prefix || '';
    cb(null, Object.entries(store)
      .filter(([key]) => !prefix || key.startsWith(prefix))
      .map(([key, value]) => ({ key, value })));
  });
  emitter.on('deleteSetting', (payload, cb) => {
    calls.push({ eventName: 'deleteSetting', payload });
    delete store[payload.key];
    cb(null, { done: true, key: payload.key });
  });

  return { store, calls };
}

test('unified settings registry manages schemas and sections', async () => {
  _internals.resetRegistry();
  const emitter = new EventEmitter();
  initSettingsRegistry(emitter);

  const permissions = {
    settings: {
      unified: {
        editSchemas: true,
        viewSettings: true,
        editSettings: true
      }
    }
  };

  const registered = await emitAsync(emitter, 'registerModuleSettingsSchema', {
    jwt: 'token',
    moduleName: 'seoManager',
    moduleType: 'core',
    decodedJWT: { permissions },
    settingsSchema: {
      label: 'SEO',
      sections: [{ key: 'defaults', label: 'Defaults' }]
    }
  });
  assert.ifError(registered.err);
  assert.strictEqual(registered.result.moduleName, 'seoManager');
  assert.strictEqual(registered.result.schema.label, 'SEO');

  const section = await emitAsync(emitter, 'registerSettingsSection', {
    jwt: 'token',
    moduleName: 'unifiedSettings',
    moduleType: 'core',
    decodedJWT: { permissions },
    targetModule: 'seoManager',
    section: { key: 'social', label: 'Social' }
  });
  assert.ifError(section.err);
  assert.strictEqual(section.result.schema.sections.length, 2);

  const schema = await emitAsync(emitter, 'getModuleSettingsSchema', {
    jwt: 'token',
    moduleName: 'unifiedSettings',
    moduleType: 'core',
    decodedJWT: { permissions },
    targetModule: 'seoManager'
  });
  assert.ifError(schema.err);
  assert.strictEqual(schema.result.moduleName, 'seoManager');
  assert(schema.result.sections.some(item => item.key === 'social'));

  const modules = await emitAsync(emitter, 'listRegisteredSettingsModules', {
    jwt: 'token',
    moduleName: 'unifiedSettings',
    moduleType: 'core',
    decodedJWT: { permissions }
  });
  assert.ifError(modules.err);
  assert.deepStrictEqual(modules.result, ['seoManager']);
});

test('unified settings reads and writes values through settings manager', async () => {
  _internals.resetRegistry();
  const emitter = new EventEmitter();
  const { store, calls } = setupSettingsStore(emitter);
  initSettingsRegistry(emitter);

  const permissions = {
    settings: {
      unified: {
        editSchemas: true,
        viewSettings: true,
        editSettings: true
      }
    }
  };

  await emitAsync(emitter, 'registerModuleSettingsSchema', {
    jwt: 'token',
    moduleName: 'unifiedSettings',
    moduleType: 'core',
    decodedJWT: { permissions },
    targetModule: 'seoManager',
    settingsSchema: { label: 'SEO' }
  });

  const updated = await emitAsync(emitter, 'updateModuleSettingValue', {
    jwt: 'token',
    moduleName: 'seoManager',
    moduleType: 'core',
    decodedJWT: { permissions },
    settingKey: 'enabled',
    newValue: true
  });
  assert.ifError(updated.err);
  assert.strictEqual(store['seoManager.enabled'], 'true');
  assert.strictEqual(calls[0].payload.moduleName, 'settingsManager');
  assert.strictEqual(calls[0].payload.key, 'seoManager.enabled');

  const value = await emitAsync(emitter, 'getModuleSettingValue', {
    jwt: 'token',
    moduleName: 'seoManager',
    moduleType: 'core',
    decodedJWT: { permissions },
    settingKey: 'enabled'
  });
  assert.ifError(value.err);
  assert.strictEqual(value.result, true);

  const bulk = await emitAsync(emitter, 'updateModuleSettings', {
    jwt: 'token',
    moduleName: 'unifiedSettings',
    moduleType: 'core',
    decodedJWT: { permissions },
    targetModule: 'seoManager',
    settings: {
      titleTemplate: '%title%',
      openGraph: { enabled: true }
    }
  });
  assert.ifError(bulk.err);
  assert.strictEqual(store['seoManager.titleTemplate'], '"%title%"');
  assert.strictEqual(store['seoManager.openGraph'], '{"enabled":true}');

  const listed = await emitAsync(emitter, 'listModuleSettings', {
    jwt: 'token',
    moduleName: 'unifiedSettings',
    moduleType: 'core',
    decodedJWT: { permissions },
    targetModule: 'seoManager'
  });
  assert.ifError(listed.err);
  assert.deepStrictEqual(listed.result, {
    enabled: true,
    titleTemplate: '%title%',
    openGraph: { enabled: true }
  });

  const bundle = await emitAsync(emitter, 'getModuleSettings', {
    jwt: 'token',
    moduleName: 'unifiedSettings',
    moduleType: 'core',
    decodedJWT: { permissions },
    targetModule: 'seoManager'
  });
  assert.ifError(bundle.err);
  assert.strictEqual(bundle.result.schema.label, 'SEO');
  assert.strictEqual(bundle.result.settings.enabled, true);

  const deleted = await emitAsync(emitter, 'deleteModuleSetting', {
    jwt: 'token',
    moduleName: 'seoManager',
    moduleType: 'core',
    decodedJWT: { permissions },
    settingKey: 'enabled'
  });
  assert.ifError(deleted.err);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(store, 'seoManager.enabled'), false);
});

test('unified settings self-service callers cannot target another module', async () => {
  _internals.resetRegistry();
  const emitter = new EventEmitter();
  const { store, calls } = setupSettingsStore(emitter);
  initSettingsRegistry(emitter);

  const permissions = {
    settings: {
      unified: {
        editSchemas: true,
        viewSettings: true,
        editSettings: true
      }
    }
  };

  const schema = await emitAsync(emitter, 'registerModuleSettingsSchema', {
    jwt: 'token',
    moduleName: 'seoManager',
    moduleType: 'core',
    decodedJWT: { permissions },
    targetModule: 'auth',
    settingsSchema: { label: 'Auth Settings' }
  });
  assert(schema.err);
  assert.match(schema.err.message, /only manage their own unified settings/);

  const write = await emitAsync(emitter, 'updateModuleSettingValue', {
    jwt: 'token',
    moduleName: 'seoManager',
    moduleType: 'core',
    decodedJWT: { permissions },
    targetModule: 'auth',
    settingKey: 'allowRegistration',
    newValue: false
  });
  assert(write.err);
  assert.match(write.err.message, /only manage their own unified settings/);
  assert.strictEqual(Object.keys(store).length, 0);
  assert.strictEqual(calls.length, 0);
});
