

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

/**
 * mother/modules/shareManager/shareService.js
 *
 * Ensures the shareManager DB (or schema) and creates the "shared_links" table/collection.
 * Similar approach to pagesService.js => meltdown => dbUpdate with placeholders.
 */

require('dotenv').config();

/**
 * ensureShareManagerDatabase:
 *   meltdown => createDatabase
 *   bridging code decides if it's a dedicated DB or shared schema for shareManager.
 */
async function ensureShareManagerDatabase(motherEmitter, jwt, nonce) {
  console.log('[SHARE MANAGER SERVICE] Ensuring shareManager DB/Schema via createDatabase...');
  const meltdownPayload = {
    jwt,
    moduleName: 'shareManager',
    moduleType: 'core',
    nonce,
    targetModuleName: 'sharemanager'
  };
  try {
    await requestBackendEvent(motherEmitter, BACKEND_EVENTS.CREATE_DATABASE, meltdownPayload);
    console.log('[SHARE MANAGER SERVICE] shareManager DB/Schema creation done (if needed).');
  } catch (err) {
    console.error('[SHARE MANAGER SERVICE] Error creating/fixing shareManager DB:', err.message);
    throw err;
  }
}

/**
 * ensureShareTables:
 *   meltdown => dbUpdate => { rawSQL: 'INIT_SHARED_LINKS_TABLE' }
 *   expected schema columns: shortToken, filePath, userId, isPublic,
 *   expiresAt TIMESTAMP
 */
async function ensureShareTables(motherEmitter, jwt, nonce) {
  console.log('[SHARE MANAGER SERVICE] Creating schema & table/collection for shareManager...');
  const meltdownPayload = {
    jwt,
    moduleName: 'shareManager',
    moduleType: 'core',
    nonce
  };
  try {
    await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
      ...meltdownPayload,
      table: '__rawSQL__',
      where: {},
      data: { rawSQL: 'INIT_SHARED_LINKS_TABLE' }
    });
    console.log('[SHARE MANAGER SERVICE] Placeholder "INIT_SHARED_LINKS_TABLE" done.');
  } catch (err) {
    console.error('[SHARE MANAGER SERVICE] Error creating shared_links table =>', err.message);
    throw err;
  }
}

module.exports = {
  ensureShareManagerDatabase,
  ensureShareTables
};
