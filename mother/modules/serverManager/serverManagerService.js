

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

/**
 * mother/modules/serverManager/serverManagerService.js
 *
 * Helper for:
 * 1) Ensuring the serverManager DB (or schema) => meltdown => createDatabase
 * 2) Ensuring the table/collection => meltdown => dbUpdate => 'INIT_SERVERMANAGER_SCHEMA'
 */

require('dotenv').config();

async function ensureServerManagerDatabase(motherEmitter, jwt, nonce) {
  console.log('[SERVER MANAGER] Ensuring serverManager DB/Schema via createDatabase meltdown...');
  try {
    await requestBackendEvent(motherEmitter, BACKEND_EVENTS.CREATE_DATABASE, {
      jwt,
      moduleName: 'serverManager',
      moduleType: 'core',
      nonce
    });
    console.log('[SERVER MANAGER] DB/Schema creation done (if needed).');
  } catch (err) {
    console.error('[SERVER MANAGER] Error creating/fixing serverManager DB:', err.message);
    throw err;
  }
}

async function ensureSchemaAndTable(motherEmitter, jwt, nonce) {
  console.log('[SERVER MANAGER] Creating schema & table/collection for serverManager...');
  try {
    await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
      jwt,
      moduleName: 'serverManager',
      moduleType: 'core',
      nonce,
      table: '__rawSQL__',
      data: { rawSQL: 'INIT_SERVERMANAGER_SCHEMA' }
    });
    console.log('[SERVER MANAGER] Placeholder "INIT_SERVERMANAGER_SCHEMA" done.');
  } catch (err) {
    console.error('[SERVER MANAGER] Error creating serverManager schema:', err.message);
    throw err;
  }
}

module.exports = {
  ensureServerManagerDatabase,
  ensureSchemaAndTable
};
