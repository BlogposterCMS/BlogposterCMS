/**
 * mother/modules/translationManager/index.js
 *
 * 1) Possibly ensures DB schema/tables via 'initTranslationTables'
 * 2) Registers meltdown events for:
 *    - createTranslatedText
 *    - getTranslatedText
 *    - updateTranslatedText
 *    - deleteTranslatedText
 *    - addLanguage
 *    - etc.
 */

const { initTranslationTables } = require('./dbInit');
const { setupTranslationCrudEvents } = require('./translationCrudEvents');
const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');
const { requestBackendEvent } = require('../../contracts/backendEventContracts');

const MODULE_NAME = 'translationManager';
const MODULE_TYPE = 'core';
const VERSION = '0.1.0';

module.exports = {
  // Owns only scoped event handlers. Schema changes still require a coordinated
  // release; replacing handlers must never re-run a database migration.
  lifecycleVersion: 1,
  async healthCheck({ motherEmitter, jwt }) {
    // Read existing storage through the canonical database contract; readiness
    // must not create tables or write data while another generation is selected.
    const rows = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
      jwt, moduleName: MODULE_NAME, moduleType: MODULE_TYPE, table: '__rawSQL__',
      data: { rawSQL: 'LIST_TRANSLATION_LANGUAGES', params: {} }
    });
    if (!Array.isArray(rows)) throw new Error('CORE_MODULE_TRANSLATION_NOT_READY');
  },
  async initialize({ motherEmitter, isCore, jwt, isModuleUpdate = false }) {
    if (!isCore) {
      throw new Error('[TRANSLATION MANAGER] Must be loaded as a core module.');
    }
    if (!jwt) {
      throw new Error('[TRANSLATION MANAGER] initialization requires a valid JWT token.');
    }
    if (!motherEmitter) {
      throw new Error('[TRANSLATION MANAGER] motherEmitter missing.');
    }

    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    console.log('[TRANSLATION MANAGER] Initializing...');

    // 1) Optionally ensure DB schema
    if (!isModuleUpdate) await initTranslationTables(motherEmitter, jwt);

    // 2) Setup meltdown events
    setupTranslationCrudEvents(motherEmitter, jwt);

    console.log('[TRANSLATION MANAGER] Initialized successfully.');
  },

  MODULE_NAME,
  MODULE_TYPE,
  VERSION
};
