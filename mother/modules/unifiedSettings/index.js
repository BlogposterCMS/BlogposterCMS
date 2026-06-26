/**
 * mother/modules/unifiedSettings/index.js
 *
 * Main entry for the "unifiedSettings" system.
 * It initializes the registry service, sets up meltdown events, and (optionally)
 * exports an Express router for /admin/settings.
 */

const registryService = require('./settingsRegistryService');
const { initSettingsRegistry } = registryService;

const MODULE_NAME = 'unifiedSettings';
const MODULE_TYPE = 'core';

module.exports = {
  /**
   * initialize:
   *   Called by mother/index.js (or a similar loader) when loading core modules.
   *   Sets up meltdown events & optionally an admin router.
   */
  async initialize({ motherEmitter, app: _app, isCore, jwt }) {
    if (!isCore) {
      throw new Error('[UNIFIED SETTINGS] Must be loaded as a core module.');
    }
    if (!jwt) {
      throw new Error('[UNIFIED SETTINGS] initialization requires a valid JWT token.');
    }
    if (!motherEmitter) {
      throw new Error('[UNIFIED SETTINGS] motherEmitter missing.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    console.log('[UNIFIED SETTINGS] Initializing the Unified Settings module...');

    // 1) Set up meltdown event listeners for this module
    initSettingsRegistry(motherEmitter);

    // 2) Optionally, if you have an admin router for /admin/settings, mount it:
    //    app.use('/admin/settings', settingsRouter);

    console.log('[UNIFIED SETTINGS] Module initialized successfully.');
  },
  _internals: registryService._internals,
  MODULE_NAME,
  MODULE_TYPE
};
