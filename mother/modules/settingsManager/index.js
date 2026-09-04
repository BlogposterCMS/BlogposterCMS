'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

require('dotenv').config();

const {
  ensuresettingsManagerDatabase,
  ensureSettingsSchemaAndTables
} = require('./settingsService');
const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');

const MODULE_NAME = 'settingsManager';
const MODULE_TYPE = 'core';

const PUBLIC_SETTING_KEYS = Object.freeze([
  'FIRST_INSTALL_DONE',
  'ALLOW_REGISTRATION',
  'FAVICON_URL',
  'SITE_TITLE',
  'SITE_DESCRIPTION',
  'SITE_URL',
  'HOME_URL',
  'DEFAULT_LANGUAGE',
  'TIMEZONE',
  'DATE_FORMAT',
  'TIME_FORMAT',
  'PERMALINK_STRUCTURE',
  'POSTS_PER_PAGE',
  'DESIGN_STUDIO_GLOBAL_BODY_BACKGROUND',
  'COMMENTS_OPEN_BY_DEFAULT',
  'COMMENT_REGISTRATION_REQUIRED'
]);



function assertSettingsPayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[SETTINGS MANAGER] ${eventName} => invalid meltdown payload`);
  }
}

function requirePayloadPermission(payload, permission) {
  if (payload?.decodedJWT && !hasPermission(payload.decodedJWT, permission)) {
    throw new Error(`Forbidden - missing permission: ${permission}`);
  }
}

function normalizeSettingKey(raw) {
  return String(raw || '').trim();
}

function normalizeSettingRows(result) {
  const rows = Array.isArray(result) ? result : (result?.rows || []);
  return rows
    .filter(row => row && typeof row.key !== 'undefined')
    .map(row => ({ key: row.key, value: row.value }));
}

function settingRowsToMap(rows = []) {
  return rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

function extractSettingValue(result) {
  if (!result) return null;
  if (Array.isArray(result)) return result[0]?.value ?? null;
  return result.value ?? null;
}

function settingListOptions(payload = {}) {
  const keys = Array.isArray(payload.keys)
    ? payload.keys.map(normalizeSettingKey).filter(Boolean)
    : [];
  return {
    prefix: normalizeSettingKey(payload.prefix || payload.modulePrefix || ''),
    keys
  };
}

function ensureSettingKey(payload, eventName) {
  const key = normalizeSettingKey(payload.key || payload.optionName || payload.name);
  if (!key) throw new Error(`[SETTINGS MANAGER] ${eventName} => "key" is required`);
  return key;
}

async function selectRaw(motherEmitter, jwt, rawSQL, fields = {}) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
    jwt,
    moduleName: MODULE_NAME,
    moduleType: MODULE_TYPE,
    table: '__rawSQL__',
    data: { rawSQL, ...fields }
  });
}

async function updateRaw(motherEmitter, jwt, rawSQL, fields = {}) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
    jwt,
    moduleName: MODULE_NAME,
    moduleType: MODULE_TYPE,
    table: '__rawSQL__',
    data: { rawSQL, ...fields }
  });
}

async function deleteRaw(motherEmitter, jwt, rawSQL, fields = {}) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_DELETE, {
    jwt,
    moduleName: MODULE_NAME,
    moduleType: MODULE_TYPE,
    table: '__rawSQL__',
    where: { rawSQL, ...fields }
  });
}

async function getStoredSetting(motherEmitter, jwt, key) {
  return extractSettingValue(await selectRaw(motherEmitter, jwt, 'GET_SETTING', { key }));
}

async function listStoredSettings(motherEmitter, jwt, options = {}) {
  return normalizeSettingRows(await selectRaw(motherEmitter, jwt, 'LIST_SETTINGS', options));
}

async function setStoredSetting(motherEmitter, jwt, key, value) {
  return updateRaw(motherEmitter, jwt, 'UPSERT_SETTING', {
    key,
    value: typeof value === 'undefined' ? null : value
  });
}

async function deleteStoredSetting(motherEmitter, jwt, key) {
  return deleteRaw(motherEmitter, jwt, 'DELETE_SETTING', { key });
}

function registerGetSettingEvent(motherEmitter, eventName) {
  motherEmitter.on(eventName, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertSettingsPayload(payload, eventName);
      requirePayloadPermission(payload, 'settings.core.view');
      const key = ensureSettingKey(payload, eventName);
      callback(null, await getStoredSetting(motherEmitter, payload.jwt, key));
    } catch (err) {
      callback(err);
    }
  });
}

function registerSetSettingEvent(motherEmitter, eventName) {
  motherEmitter.on(eventName, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertSettingsPayload(payload, eventName);
      requirePayloadPermission(payload, 'settings.core.edit');
      const key = ensureSettingKey(payload, eventName);
      callback(null, await setStoredSetting(motherEmitter, payload.jwt, key, payload.value));
    } catch (err) {
      callback(err);
    }
  });
}

function registerListSettingsEvent(motherEmitter, eventName) {
  motherEmitter.on(eventName, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertSettingsPayload(payload, eventName);
      requirePayloadPermission(payload, 'settings.core.view');
      callback(null, await listStoredSettings(motherEmitter, payload.jwt, settingListOptions(payload)));
    } catch (err) {
      callback(err);
    }
  });
}

function registerDeleteSettingEvent(motherEmitter, eventName) {
  motherEmitter.on(eventName, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertSettingsPayload(payload, eventName);
      requirePayloadPermission(payload, 'settings.core.edit');
      const key = ensureSettingKey(payload, eventName);
      callback(null, await deleteStoredSetting(motherEmitter, payload.jwt, key));
    } catch (err) {
      callback(err);
    }
  });
}

function setupSettingsListeners(motherEmitter) {
  console.log('[SETTINGS MANAGER] Setting up meltdown event listeners...');

  registerGetSettingEvent(motherEmitter, BACKEND_EVENTS.GET_SETTING);
  registerGetSettingEvent(motherEmitter, 'getOption');
  registerSetSettingEvent(motherEmitter, BACKEND_EVENTS.SET_SETTING);
  registerSetSettingEvent(motherEmitter, 'updateOption');
  registerListSettingsEvent(motherEmitter, BACKEND_EVENTS.LIST_SETTINGS);
  registerListSettingsEvent(motherEmitter, 'listOptions');
  registerDeleteSettingEvent(motherEmitter, BACKEND_EVENTS.DELETE_SETTING);
  registerDeleteSettingEvent(motherEmitter, 'deleteOption');

  motherEmitter.on(BACKEND_EVENTS.GET_PUBLIC_SETTING, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertSettingsPayload(payload, BACKEND_EVENTS.GET_PUBLIC_SETTING);
      const key = ensureSettingKey(payload, BACKEND_EVENTS.GET_PUBLIC_SETTING);
      if (!PUBLIC_SETTING_KEYS.includes(key)) throw new Error('Forbidden - key not allowed');
      callback(null, await getStoredSetting(motherEmitter, payload.jwt, key));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on(BACKEND_EVENTS.GET_PUBLIC_SETTINGS, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertSettingsPayload(payload, BACKEND_EVENTS.GET_PUBLIC_SETTINGS);
      const requestedKeys = Array.isArray(payload.keys)
        ? payload.keys.map(normalizeSettingKey).filter(Boolean)
        : PUBLIC_SETTING_KEYS;
      const blocked = requestedKeys.filter(key => !PUBLIC_SETTING_KEYS.includes(key));
      if (blocked.length) throw new Error('Forbidden - key not allowed');
      const rows = await listStoredSettings(motherEmitter, payload.jwt, { keys: requestedKeys });
      callback(null, settingRowsToMap(rows));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on(BACKEND_EVENTS.GET_ALL_SETTINGS, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertSettingsPayload(payload, BACKEND_EVENTS.GET_ALL_SETTINGS);
      requirePayloadPermission(payload, 'settings.core.view');
      callback(null, await selectRaw(motherEmitter, payload.jwt, 'GET_ALL_SETTINGS'));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on(BACKEND_EVENTS.SET_SETTINGS, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertSettingsPayload(payload, BACKEND_EVENTS.SET_SETTINGS);
      requirePayloadPermission(payload, 'settings.core.edit');
      const settings = payload.settings || payload.options || {};
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        throw new Error('[SETTINGS MANAGER] setSettings => "settings" object is required');
      }
      const results = {};
      for (const [rawKey, value] of Object.entries(settings)) {
        const key = normalizeSettingKey(rawKey);
        if (!key) continue;
        results[key] = await setStoredSetting(motherEmitter, payload.jwt, key, value);
      }
      callback(null, { done: true, results });
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on(BACKEND_EVENTS.SET_CMS_MODE, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertSettingsPayload(payload, BACKEND_EVENTS.SET_CMS_MODE);
      requirePayloadPermission(payload, 'settings.core.edit');
      if (!payload.mode) throw new Error('Mode is required (e.g., cms, shop, headless)');
      callback(null, await setStoredSetting(motherEmitter, payload.jwt, 'CMS_MODE', payload.mode));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on(BACKEND_EVENTS.GET_CMS_MODE, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertSettingsPayload(payload, BACKEND_EVENTS.GET_CMS_MODE);
      requirePayloadPermission(payload, 'settings.core.view');
      callback(null, await getStoredSetting(motherEmitter, payload.jwt, 'CMS_MODE'));
    } catch (err) {
      callback(err);
    }
  });

  console.log('[SETTINGS MANAGER] All meltdown event listeners set.');
}

module.exports = {
  async initialize({ motherEmitter, isCore, moduleDbSalt, jwt }) {
    if (!isCore) {
      throw new Error('[SETTINGS MANAGER] Must be loaded as a core module.');
    }
    if (!jwt) {
      throw new Error('[SETTINGS MANAGER] initialization requires a valid JWT token.');
    }
    if (!motherEmitter) {
      throw new Error('[SETTINGS MANAGER] motherEmitter missing.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    console.log('[SETTINGS MANAGER] Initializing SETTINGS MANAGER...');

    try {
      await ensuresettingsManagerDatabase(motherEmitter, moduleDbSalt, jwt);
      await ensureSettingsSchemaAndTables(motherEmitter, jwt);
      setupSettingsListeners(motherEmitter);
      console.log('[SETTINGS MANAGER] SETTINGS MANAGER initialized successfully.');
    } catch (err) {
      console.error('[SETTINGS MANAGER] Error during initialization:', err.message);
    }
  },
  setupSettingsListeners,
  _internals: {
    PUBLIC_SETTING_KEYS,
    normalizeSettingRows,
    settingRowsToMap
  }
};
