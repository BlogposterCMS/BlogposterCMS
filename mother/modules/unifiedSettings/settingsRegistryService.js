'use strict';

require('dotenv').config();

const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');

const MODULE_NAME = 'unifiedSettings';
const MODULE_TYPE = 'core';

let schemaRegistry = {};

function normalizeModuleKey(value = '') {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, '')
    .slice(0, 120);
}

function normalizeSettingKey(value = '') {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, '')
    .slice(0, 160);
}

function assertCorePayload(payload, eventName, { requireUnifiedModule = false } = {}) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || !moduleName || moduleType !== MODULE_TYPE) {
    throw new Error(`[UNIFIED SETTINGS] ${eventName} => invalid meltdown payload.`);
  }
  if (requireUnifiedModule && moduleName !== MODULE_NAME) {
    throw new Error(`[UNIFIED SETTINGS] ${eventName} => moduleName must be ${MODULE_NAME}.`);
  }
}

function requirePermission(payload, permission) {
  if (payload?.decodedJWT && !hasPermission(payload.decodedJWT, permission)) {
    throw new Error(`Forbidden - missing permission: ${permission}`);
  }
}

function targetModuleFromPayload(payload = {}, fallbackToCaller = true) {
  const callerModule = normalizeModuleKey(payload.moduleName);
  const explicitRaw = payload.targetModule || payload.targetModuleName || payload.module || '';
  const explicitTarget = normalizeModuleKey(explicitRaw);

  if (fallbackToCaller && callerModule && callerModule !== MODULE_NAME) {
    if (explicitTarget && explicitTarget !== callerModule) {
      throw new Error('Core modules can only manage their own unified settings.');
    }
    return callerModule;
  }

  const raw = explicitTarget || (fallbackToCaller ? callerModule : '');
  const targetModule = normalizeModuleKey(raw);
  if (!targetModule || targetModule === MODULE_NAME && !fallbackToCaller) {
    throw new Error('targetModule is required.');
  }
  return targetModule;
}

function prefixedKey(moduleName, settingKey) {
  const targetModule = normalizeModuleKey(moduleName);
  const key = normalizeSettingKey(settingKey);
  if (!targetModule || !key) throw new Error('targetModule and settingKey are required.');
  return `${targetModule}.${key}`;
}

function stripModulePrefix(moduleName, key) {
  const prefix = `${moduleName}.`;
  return String(key || '').startsWith(prefix) ? String(key).slice(prefix.length) : String(key || '');
}

function serializeSettingValue(value) {
  return JSON.stringify(value);
}

function deserializeSettingValue(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function emitSettingsManager(motherEmitter, jwt, eventName, payload = {}) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(eventName, {
      ...payload,
      jwt,
      moduleName: 'settingsManager',
      moduleType: MODULE_TYPE
    }, onceCallback((err, result) => (err ? reject(err) : resolve(result))));
  });
}

function schemaFor(moduleName) {
  return schemaRegistry[moduleName] || null;
}

function registerSchema(moduleName, settingsSchema) {
  if (!settingsSchema || typeof settingsSchema !== 'object' || Array.isArray(settingsSchema)) {
    throw new Error('settingsSchema object is required.');
  }
  schemaRegistry[moduleName] = {
    ...settingsSchema,
    moduleName,
    registeredAt: settingsSchema.registeredAt || new Date().toISOString()
  };
  return schemaRegistry[moduleName];
}

function listSchemas() {
  return Object.keys(schemaRegistry)
    .sort()
    .map(moduleName => schemaRegistry[moduleName]);
}

function rowsToSettingsMap(moduleName, rows = []) {
  const list = Array.isArray(rows) ? rows : (rows?.rows || []);
  return list.reduce((acc, row) => {
    const shortKey = stripModulePrefix(moduleName, row.key);
    acc[shortKey] = deserializeSettingValue(row.value);
    return acc;
  }, {});
}

async function listModuleSettingsValues(motherEmitter, jwt, moduleName) {
  const rows = await emitSettingsManager(motherEmitter, jwt, 'listSettings', { prefix: `${moduleName}.` });
  return rowsToSettingsMap(moduleName, rows);
}

async function getModuleSettingValue(motherEmitter, jwt, moduleName, settingKey) {
  const value = await emitSettingsManager(motherEmitter, jwt, 'getSetting', {
    key: prefixedKey(moduleName, settingKey)
  });
  return deserializeSettingValue(value);
}

async function updateModuleSettingValue(motherEmitter, jwt, moduleName, settingKey, value) {
  return emitSettingsManager(motherEmitter, jwt, 'setSetting', {
    key: prefixedKey(moduleName, settingKey),
    value: serializeSettingValue(value)
  });
}

async function updateModuleSettings(motherEmitter, jwt, moduleName, settings = {}) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('settings object is required.');
  }
  const prefixed = {};
  for (const [rawKey, value] of Object.entries(settings)) {
    prefixed[prefixedKey(moduleName, rawKey)] = serializeSettingValue(value);
  }
  return emitSettingsManager(motherEmitter, jwt, 'setSettings', { settings: prefixed });
}

async function deleteModuleSetting(motherEmitter, jwt, moduleName, settingKey) {
  return emitSettingsManager(motherEmitter, jwt, 'deleteSetting', {
    key: prefixedKey(moduleName, settingKey)
  });
}

function initSettingsRegistry(motherEmitter) {
  motherEmitter.on('registerModuleSettingsSchema', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'registerModuleSettingsSchema');
      requirePermission(payload, 'settings.unified.editSchemas');
      const targetModule = targetModuleFromPayload(payload, payload.moduleName !== MODULE_NAME);
      const schema = registerSchema(targetModule, payload.settingsSchema || payload.schema);
      callback(null, { success: true, moduleName: targetModule, schema });
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('registerSettingsSection', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'registerSettingsSection');
      requirePermission(payload, 'settings.unified.editSchemas');
      const targetModule = targetModuleFromPayload(payload, payload.moduleName !== MODULE_NAME);
      const existing = schemaFor(targetModule) || { moduleName: targetModule, sections: [] };
      const section = payload.section || payload.settingsSection;
      if (!section || typeof section !== 'object' || Array.isArray(section)) {
        throw new Error('section object is required.');
      }
      const sections = Array.isArray(existing.sections) ? existing.sections.filter(item => item.key !== section.key) : [];
      const schema = registerSchema(targetModule, {
        ...existing,
        sections: [...sections, section]
      });
      callback(null, { success: true, moduleName: targetModule, schema });
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getModuleSettingsSchema', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'getModuleSettingsSchema', { requireUnifiedModule: true });
      requirePermission(payload, 'settings.unified.viewSettings');
      const targetModule = targetModuleFromPayload(payload, false);
      callback(null, schemaFor(targetModule));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('listModuleSettingsSchemas', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'listModuleSettingsSchemas', { requireUnifiedModule: true });
      requirePermission(payload, 'settings.unified.viewSettings');
      callback(null, listSchemas());
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('listRegisteredSettingsModules', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'listRegisteredSettingsModules', { requireUnifiedModule: true });
      requirePermission(payload, 'settings.unified.viewSettings');
      callback(null, retrieveAllRegisteredModules());
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getModuleSettingValue', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'getModuleSettingValue');
      requirePermission(payload, 'settings.unified.viewSettings');
      const targetModule = targetModuleFromPayload(payload, payload.moduleName !== MODULE_NAME);
      callback(null, await getModuleSettingValue(
        motherEmitter,
        payload.jwt,
        targetModule,
        payload.settingKey || payload.key
      ));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('listModuleSettings', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'listModuleSettings', { requireUnifiedModule: true });
      requirePermission(payload, 'settings.unified.viewSettings');
      const targetModule = targetModuleFromPayload(payload, false);
      callback(null, await listModuleSettingsValues(motherEmitter, payload.jwt, targetModule));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getModuleSettings', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'getModuleSettings', { requireUnifiedModule: true });
      requirePermission(payload, 'settings.unified.viewSettings');
      const targetModule = targetModuleFromPayload(payload, false);
      callback(null, {
        moduleName: targetModule,
        schema: schemaFor(targetModule),
        settings: await listModuleSettingsValues(motherEmitter, payload.jwt, targetModule)
      });
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('updateModuleSettingValue', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'updateModuleSettingValue');
      requirePermission(payload, 'settings.unified.editSettings');
      const targetModule = targetModuleFromPayload(payload, payload.moduleName !== MODULE_NAME);
      const value = Object.prototype.hasOwnProperty.call(payload, 'newValue') ? payload.newValue : payload.value;
      callback(null, await updateModuleSettingValue(
        motherEmitter,
        payload.jwt,
        targetModule,
        payload.settingKey || payload.key,
        value
      ));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('updateModuleSettings', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'updateModuleSettings');
      requirePermission(payload, 'settings.unified.editSettings');
      const targetModule = targetModuleFromPayload(payload, payload.moduleName !== MODULE_NAME);
      callback(null, await updateModuleSettings(motherEmitter, payload.jwt, targetModule, payload.settings || payload.values));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('deleteModuleSetting', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'deleteModuleSetting');
      requirePermission(payload, 'settings.unified.editSettings');
      const targetModule = targetModuleFromPayload(payload, payload.moduleName !== MODULE_NAME);
      callback(null, await deleteModuleSetting(motherEmitter, payload.jwt, targetModule, payload.settingKey || payload.key));
    } catch (err) {
      callback(err);
    }
  });
}

function retrieveSchemaForModule(moduleName) {
  return schemaFor(normalizeModuleKey(moduleName));
}

function retrieveAllRegisteredModules() {
  return Object.keys(schemaRegistry).sort();
}

function resetRegistry() {
  schemaRegistry = {};
}

module.exports = {
  initSettingsRegistry,
  retrieveSchemaForModule,
  retrieveAllRegisteredModules,
  _internals: {
    deleteModuleSetting,
    deserializeSettingValue,
    getModuleSettingValue,
    listModuleSettingsValues,
    normalizeModuleKey,
    normalizeSettingKey,
    prefixedKey,
    registerSchema,
    resetRegistry,
    serializeSettingValue,
    updateModuleSettingValue,
    updateModuleSettings
  }
};
