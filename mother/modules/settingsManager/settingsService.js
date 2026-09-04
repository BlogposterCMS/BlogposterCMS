

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

// mother/modules/settingsManager/settingsService.js

require('dotenv').config();

/**
 * ensuresettingsManagerDatabase:
 *   meltdown => "createDatabase" for "settingsManager"
 *   optionally uses "moduleDbSalt" as a nonce
 */
async function ensuresettingsManagerDatabase(motherEmitter, moduleDbSalt, jwt) {
  console.log('[SETTINGS MANAGER] Ensuring settingsManager DB/Schema via createDatabase...');
  const meltdownPayload = {
    jwt,
    moduleName: 'settingsManager',
    moduleType: 'core'
  };
  if (moduleDbSalt) {
    meltdownPayload.nonce = moduleDbSalt;
  }
  try {
    await requestBackendEvent(motherEmitter, BACKEND_EVENTS.CREATE_DATABASE, meltdownPayload);
    console.log('[SETTINGS MANAGER] settingsManager DB/Schema creation done (if needed).');
  } catch (err) {
    console.error('[SETTINGS MANAGER] Error creating/fixing settingsManager DB:', err.message);
    throw err;
  }
}

/**
 * ensureSettingsSchemaAndTables:
 *   meltdown => dbUpdate => 'INIT_SETTINGS_SCHEMA'
 *   meltdown => dbUpdate => 'INIT_SETTINGS_TABLES'
 *   meltdown => dbUpdate => 'CHECK_AND_ALTER_SETTINGS_TABLES'
 */
async function ensureSettingsSchemaAndTables(motherEmitter, jwt) {
  console.log('[SETTINGS MANAGER] Creating schema & tables for settingsManager (yay placeholders).');

  try {
    await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
      jwt,
      moduleName: 'settingsManager',
      moduleType: 'core',
      table: '__rawSQL__',
      data: { rawSQL: 'INIT_SETTINGS_SCHEMA' }
    });
    console.log('[SETTINGS MANAGER] Schema creation/verification done.');
  } catch (err) {
    console.error('[SETTINGS MANAGER] Error creating schema:', err.message);
    throw err;
  }

  try {
    await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
      jwt,
      moduleName: 'settingsManager',
      moduleType: 'core',
      table: '__rawSQL__',
      data: { rawSQL: 'INIT_SETTINGS_TABLES' }
    });
    console.log('[SETTINGS MANAGER] "cms_settings" & "module_events" creation/verification done.');
  } catch (err) {
    console.error('[SETTINGS MANAGER] Error creating settings tables:', err.message);
    throw err;
  }

  await checkAndAlterSettingsTables(motherEmitter, jwt);
}

async function checkAndAlterSettingsTables(motherEmitter, jwt) {
  try {
    await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
      jwt,
      moduleName: 'settingsManager',
      moduleType: 'core',
      table: '__rawSQL__',
      data: { rawSQL: 'CHECK_AND_ALTER_SETTINGS_TABLES' }
    });
    console.log('[SETTINGS MANAGER] All required columns ensured in cms_settings/module_events.');
  } catch (err) {
    console.error('[SETTINGS MANAGER] Error checking/altering columns:', err.message);
    throw err;
  }
}

module.exports = {
  ensuresettingsManagerDatabase,
  ensureSettingsSchemaAndTables
};
