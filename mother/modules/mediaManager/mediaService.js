

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

/**
 * mother/modules/mediaManager/mediaService.js
 *
 * This file has two simple functions:
 *   1) ensureMediaManagerDatabase => meltdown => createDatabase
 *   2) ensureMediaTables => meltdown => dbUpdate => 'INIT_MEDIA_SCHEMA'
 *
 */

require('dotenv').config();

async function ensureMediaManagerDatabase(motherEmitter, jwt) {
  console.log('[MEDIA MANAGER] Ensuring mediaManager DB/Schema via createDatabase meltdown...');
  try {
    await requestBackendEvent(motherEmitter, BACKEND_EVENTS.CREATE_DATABASE, {
      jwt,
      moduleName: 'mediaManager',
      moduleType: 'core'
    });
    console.log('[MEDIA MANAGER] DB/Schema creation done (if needed).');
  } catch (err) {
    console.error('[MEDIA MANAGER] Error creating/fixing mediaManager DB:', err.message);
    throw err;
  }
}

async function ensureMediaTables(motherEmitter, jwt) {
  console.log('[MEDIA MANAGER] Creating schema & table/collection for mediaManager...');
  try {
    await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
      jwt,
      moduleName: 'mediaManager',
      moduleType: 'core',
      table: '__rawSQL__',
      data: { rawSQL: 'INIT_MEDIA_SCHEMA' }
    });
    console.log('[MEDIA MANAGER] Placeholder "INIT_MEDIA_SCHEMA" done.');
  } catch (err) {
    console.error('[MEDIA MANAGER] Error creating media schema/tables:', err.message);
    throw err;
  }
}

function mediaDbUpdate(motherEmitter, jwt, rawSQL, params = {}) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
    jwt,
    moduleName: 'mediaManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

function mediaDbSelect(motherEmitter, jwt, rawSQL, params = {}) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
    jwt,
    moduleName: 'mediaManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

module.exports = {
  ensureMediaManagerDatabase,
  ensureMediaTables,
  mediaDbSelect,
  mediaDbUpdate
};
