// mother/modules/settingsManager/settingsService.js

require('dotenv').config();

/**
 * ensuresettingsManagerDatabase:
 *   meltdown => "createDatabase" for "settingsManager"
 *   optionally uses "moduleDbSalt" as a nonce
 */
function ensuresettingsManagerDatabase(motherEmitter, moduleDbSalt, jwt) {
  return new Promise((resolve, reject) => {
    console.log('[SETTINGS MANAGER] Ensuring settingsManager DB/Schema via createDatabase...');

    const meltdownPayload = {
      jwt,
      moduleName : 'settingsManager',
      moduleType : 'core'
    };
    if (moduleDbSalt) {
      meltdownPayload.nonce = moduleDbSalt;
    }

    motherEmitter.emit(
      'createDatabase',
      meltdownPayload,
      (err) => {
        if (err) {
          console.error('[SETTINGS MANAGER] Error creating/fixing settingsManager DB:', err.message);
          return reject(err);
        }
        console.log('[SETTINGS MANAGER] settingsManager DB/Schema creation done (if needed).');
        resolve();
      }
    );
  });
}

/**
 * ensureSettingsSchemaAndTables:
 *   meltdown => dbUpdate => 'INIT_SETTINGS_SCHEMA'
 *   meltdown => dbUpdate => 'INIT_SETTINGS_TABLES'
 *   meltdown => dbUpdate => 'CHECK_AND_ALTER_SETTINGS_TABLES'
 */
function ensureSettingsSchemaAndTables(motherEmitter, jwt) {
  return new Promise((resolve, reject) => {
    console.log('[SETTINGS MANAGER] Creating schema & tables for settingsManager (yay placeholders).');

    // meltdown => dbUpdate => 'INIT_SETTINGS_SCHEMA'
    motherEmitter.emit(
      'dbUpdate',
      {
        jwt,
        moduleName : 'settingsManager',
        moduleType : 'core',
        table      : '__rawSQL__',
        data       : { rawSQL: 'INIT_SETTINGS_SCHEMA' }
      },
      (schemaErr) => {
        if (schemaErr) {
          console.error('[SETTINGS MANAGER] Error creating schema:', schemaErr.message);
          return reject(schemaErr);
        }
        console.log('[SETTINGS MANAGER] Schema creation/verification done.');

        // meltdown => dbUpdate => 'INIT_SETTINGS_TABLES'
        motherEmitter.emit(
          'dbUpdate',
          {
            jwt,
            moduleName : 'settingsManager',
            moduleType : 'core',
            table      : '__rawSQL__',
            data       : { rawSQL: 'INIT_SETTINGS_TABLES' }
          },
          async (tableErr) => {
            if (tableErr) {
              console.error('[SETTINGS MANAGER] Error creating settings tables:', tableErr.message);
              return reject(tableErr);
            }
            console.log('[SETTINGS MANAGER] "cms_settings" & "module_events" creation/verification done.');

            // meltdown => dbUpdate => 'CHECK_AND_ALTER_SETTINGS_TABLES'
            try {
              await checkAndAlterSettingsTables(motherEmitter, jwt);
              resolve();
            } catch (alterErr) {
              reject(alterErr);
            }
          }
        );
      }
    );
  });
}

function checkAndAlterSettingsTables(motherEmitter, jwt) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(
      'dbUpdate',
      {
        jwt,
        moduleName : 'settingsManager',
        moduleType : 'core',
        table      : '__rawSQL__',
        data       : { rawSQL: 'CHECK_AND_ALTER_SETTINGS_TABLES' }
      },
      (err) => {
        if (err) {
          console.error('[SETTINGS MANAGER] Error checking/altering columns:', err.message);
          return reject(err);
        }
        console.log('[SETTINGS MANAGER] All required columns ensured in cms_settings/module_events.');
        resolve();
      }
    );
  });
}

module.exports = {
  ensuresettingsManagerDatabase,
  ensureSettingsSchemaAndTables
};
