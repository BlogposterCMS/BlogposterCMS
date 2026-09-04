

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

/**
 * mother/modules/translationManager/dbInit.js
 *
 * meltdown => dbUpdate => rawSQL: 'INIT_TRANSLATION_TABLES'
 */
require('dotenv').config();

async function initTranslationTables(motherEmitter, jwt) {
  console.log('[TRANSLATION MANAGER] Ensuring translation tables/collections...');

  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
  jwt,
  moduleName: 'translationManager',
  moduleType: 'core',
  table: '__rawSQL__',
  data: {
    rawSQL: 'INIT_TRANSLATION_TABLES'
  }
}).then(res => {
  console.log('[TRANSLATION] translation tables/collections ensured.');
  return res;
}, err => {
  console.error('[TRANSLATION] Could not create/fix translation tables =>', err.message);
  throw err;
});
}

module.exports = {
  initTranslationTables
};
