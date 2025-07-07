// mother/modules/settingsManager/index.js

require('dotenv').config();
const {
  ensuresettingsManagerDatabase,
  ensureSettingsSchemaAndTables
} = require('./settingsService');

// Because meltdown can be quirky
const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');

/**
 * initialize:
 *   1) Ensures settingsManager DB or schema
 *   2) Ensures schema/tables (e.g. settingsManager.cms_settings)
 *   3) Registers meltdown event listeners (getSetting, setSetting, etc.)
 */
module.exports = {
  async initialize({ motherEmitter, isCore, moduleDbSalt, jwt }) {
    if (!isCore) {
      console.error('[SETTINGS MANAGER] Must be loaded as a core module. Sorry, meltdown rules.');
      return;
    }
    if (!jwt) {
      console.error('[SETTINGS MANAGER] No JWT provided, meltdown meltdown => cannot proceed.');
      return;
    }

    console.log('[SETTINGS MANAGER] Initializing SETTINGS MANAGER...');

    try {
      // 1) Ensure DB or schema
      await ensuresettingsManagerDatabase(motherEmitter, moduleDbSalt, jwt);

      // 2) Create/ensure schema & tables
      await ensureSettingsSchemaAndTables(motherEmitter, jwt);

      // 3) Register meltdown event listeners
      setupSettingsListeners(motherEmitter);

      console.log('[SETTINGS MANAGER] SETTINGS MANAGER initialized successfully.');
    } catch (err) {
      console.error('[SETTINGS MANAGER] Error during initialization:', err.message);
    }
  }
};

/**
 * setupSettingsListeners:
 *   meltdown event handlers for:
 *     - getSetting
 *     - setSetting
 *     - getAllSettings
 *     - setCmsMode
 *     - getCmsMode
 *
 * We do meltdown => dbSelect/dbUpdate with `table:'__rawSQL__'` placeholders,
 * letting bridging code handle the actual DB logic (Postgres, Mongo, etc.).
 */
function setupSettingsListeners(motherEmitter) {
  console.log('[SETTINGS MANAGER] Setting up meltdown event listeners...');

  // A) getSetting
  motherEmitter.on('getSetting', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, moduleName, moduleType, key } = payload || {};
      if (!jwt || moduleName !== 'settingsManager' || moduleType !== 'core') {
        return callback(new Error('[SETTINGS MANAGER] getSetting => invalid meltdown payload'));
      }
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'settings.core.view')) {
        return callback(new Error('Forbidden – missing permission: settings.core.view'));
      }
      if (!key) {
        return callback(new Error('[SETTINGS MANAGER] getSetting => "key" is required'));
      }

      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName : 'settingsManager',
          moduleType : 'core',
          table      : '__rawSQL__',
          data       : { rawSQL: 'GET_SETTING', key }
        },
        (err, result) => {
          if (err) return callback(err);
          if (!result) return callback(null, null);

          let value = null;
          if (Array.isArray(result) && result[0] && result[0].value !== undefined) {
            value = result[0].value;
          } else if (result.value !== undefined) {
            value = result.value;
          }
          callback(null, value);
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  const PUBLIC_SETTING_KEYS = [
    'FIRST_INSTALL_DONE',
    'ALLOW_REGISTRATION',
    'FAVICON_URL'
  ];

  // A2) getPublicSetting
  motherEmitter.on('getPublicSetting', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, moduleName, moduleType, key } = payload || {};
      if (!jwt || moduleName !== 'settingsManager' || moduleType !== 'core') {
        return callback(new Error('[SETTINGS MANAGER] getPublicSetting => invalid meltdown payload'));
      }
      if (!key || !PUBLIC_SETTING_KEYS.includes(key)) {
        return callback(new Error('Forbidden – key not allowed'));
      }

      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName: 'settingsManager',
          moduleType: 'core',
          table: '__rawSQL__',
          data: { rawSQL: 'GET_SETTING', key }
        },
        (err, result) => {
          if (err) return callback(err);
          if (!result) return callback(null, null);

          let value = null;
          if (Array.isArray(result) && result[0] && result[0].value !== undefined) {
            value = result[0].value;
          } else if (result.value !== undefined) {
            value = result.value;
          }
          callback(null, value);
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // B) setSetting
  motherEmitter.on('setSetting', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, moduleName, moduleType, key, value } = payload || {};
      if (!jwt || moduleName !== 'settingsManager' || moduleType !== 'core') {
        return callback(new Error('[SETTINGS MANAGER] setSetting => invalid meltdown payload'));
      }
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'settings.core.edit')) {
        return callback(new Error('Forbidden – missing permission: settings.core.edit'));
      }
      if (!key) {
        return callback(new Error('[SETTINGS MANAGER] setSetting => "key" is required'));
      }

      motherEmitter.emit(
        'dbUpdate',
        {
          jwt,
          moduleName : 'settingsManager',
          moduleType : 'core',
          table      : '__rawSQL__',
          data       : { rawSQL: 'UPSERT_SETTING', key, value }
        },
        (err, result) => {
          if (err) return callback(err);
          callback(null, result);
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // C) getAllSettings
  motherEmitter.on('getAllSettings', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, moduleName, moduleType } = payload || {};
      if (!jwt || moduleName !== 'settingsManager' || moduleType !== 'core') {
        return callback(new Error('[SETTINGS MANAGER] getAllSettings => invalid meltdown payload'));
      }
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'settings.core.view')) {
        return callback(new Error('Forbidden – missing permission: settings.core.view'));
      }

      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName : 'settingsManager',
          moduleType : 'core',
          table      : '__rawSQL__',
          data       : { rawSQL: 'GET_ALL_SETTINGS' }
        },
        (err, result) => {
          if (err) return callback(err);
          callback(null, result || {});
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // D) setCmsMode
  motherEmitter.on('setCmsMode', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, moduleName, moduleType, mode } = payload || {};
      if (!jwt || moduleName !== 'settingsManager' || moduleType !== 'core') {
        return callback(new Error('[SETTINGS MANAGER] setCmsMode => invalid meltdown payload'));
      }
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'settings.core.edit')) {
        return callback(new Error('Forbidden – missing permission: settings.core.edit'));
      }
      if (!mode) {
        return callback(new Error('Mode is required (e.g., cms, shop, headless)'));
      }

      motherEmitter.emit(
        'dbUpdate',
        {
          jwt,
          moduleName : 'settingsManager',
          moduleType : 'core',
          table      : '__rawSQL__',
          data       : { rawSQL: 'UPSERT_SETTING', key: 'CMS_MODE', value: mode }
        },
        (err, result) => {
          if (err) return callback(err);
          callback(null, result);
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // E) getCmsMode
  motherEmitter.on('getCmsMode', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, moduleName, moduleType } = payload || {};
      if (!jwt || moduleName !== 'settingsManager' || moduleType !== 'core') {
        return callback(new Error('[SETTINGS MANAGER] getCmsMode => invalid meltdown payload'));
      }
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'settings.core.view')) {
        return callback(new Error('Forbidden – missing permission: settings.core.view'));
      }

      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName : 'settingsManager',
          moduleType : 'core',
          table      : '__rawSQL__',
          data       : { rawSQL:'GET_SETTING', key:'CMS_MODE' }
        },
        (err, result) => {
          if (err) return callback(err);

          let value = null;
          if (Array.isArray(result) && result[0] && result[0].value !== undefined) {
            value = result[0].value;
          } else if (result && result.value !== undefined) {
            value = result.value;
          }
          callback(null, value);
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  console.log('[SETTINGS MANAGER] All meltdown event listeners set (dbSelect/dbUpdate placeholders).');
}
