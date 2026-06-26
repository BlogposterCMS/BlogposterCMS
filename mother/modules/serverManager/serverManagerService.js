/**
 * mother/modules/serverManager/serverManagerService.js
 *
 * Helper for:
 * 1) Ensuring the serverManager DB (or schema) => meltdown => createDatabase
 * 2) Ensuring the table/collection => meltdown => dbUpdate => 'INIT_SERVERMANAGER_SCHEMA'
 */

require('dotenv').config();

function ensureServerManagerDatabase(motherEmitter, jwt, nonce) {
  return new Promise((resolve, reject) => {
    console.log('[SERVER MANAGER] Ensuring serverManager DB/Schema via createDatabase meltdown...');

    motherEmitter.emit(
      'createDatabase',
      {
        jwt,
        moduleName: 'serverManager',
        moduleType: 'core',
        nonce
      },
      (err) => {
        if (err) {
          console.error('[SERVER MANAGER] Error creating/fixing serverManager DB:', err.message);
          return reject(err);
        }
        console.log('[SERVER MANAGER] DB/Schema creation done (if needed).');
        resolve();
      }
    );
  });
}

function ensureSchemaAndTable(motherEmitter, jwt, nonce) {
  return new Promise((resolve, reject) => {
    console.log('[SERVER MANAGER] Creating schema & table/collection for serverManager...');

    motherEmitter.emit(
      'dbUpdate',
      {
        jwt,
        moduleName: 'serverManager',
        moduleType: 'core',
        nonce,
        table: '__rawSQL__',
        data: { rawSQL: 'INIT_SERVERMANAGER_SCHEMA' }
      },
      (schemaErr) => {
        if (schemaErr) {
          console.error('[SERVER MANAGER] Error creating serverManager schema:', schemaErr.message);
          return reject(schemaErr);
        }
        console.log('[SERVER MANAGER] Placeholder "INIT_SERVERMANAGER_SCHEMA" done.');
        resolve();
      }
    );
  });
}

module.exports = {
  ensureServerManagerDatabase,
  ensureSchemaAndTable
};
