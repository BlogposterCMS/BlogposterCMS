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

const MODULE_NAME = 'translationManager';
const MODULE_TYPE = 'core';
const VERSION = '0.1.0';

module.exports = {
  async initialize({ motherEmitter, isCore, jwt }) {
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
    await initTranslationTables(motherEmitter, jwt);

    // 2) Setup meltdown events
    setupTranslationCrudEvents(motherEmitter, jwt);

    console.log('[TRANSLATION MANAGER] Initialized successfully.');
  },

  MODULE_NAME,
  MODULE_TYPE,
  VERSION
};
