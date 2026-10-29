/**
 * mother/modules/databaseManager/index.js
 */
const { registerCreateDatabaseEvent } = require('./meltdownBridging/createDatabaseEvent');
const { registerPerformDbOperationEvent } = require('./meltdownBridging/performDbOperationEvent');
const { registerHighLevelCrudEvents } = require('./meltdownBridging/highLevelCrudEvents');
const { registerApplySchemaFileEvent } = require("./meltdownBridging/applySchemaFileEvent");
const { registerApplySchemaDefinitionEvent } = require("./meltdownBridging/applySchemaDefinitionEvent");
const { initializeDatabaseManagerDatabase } = require('./dbSetup');
const { getDbType } = require('./helpers/dbTypeHelpers');

// NEW: typed notifications
const notificationEmitter = require('../../emitters/notificationEmitter');

const MODULE_NAME = 'databaseManager';
const MODULE_TYPE = 'core';

module.exports = {
  lifecycleVersion: 1,
  async healthCheck() {
    // Engines and pools are canonical host services. Probe an existing database
    // directly: the candidate's event handlers are not public until activation.
    const engine = require('./engines/engineFactory').getEngine();
    const type = getDbType();
    if (type === 'sqlite') await engine.performSqliteOperation('databaseManager', 'SELECT 1', [], false);
    else if (type === 'postgres') await engine.performPostgresOperation('databaseManager', 'SELECT 1', [], false);
    else if (type === 'mongodb') await engine.performMongoOperation('databaseManager', 'find', { collectionName: 'module_users', query: {} });
    else throw new Error('CORE_MODULE_DATABASE_ENGINE_UNSUPPORTED');
  },
  async initialize({ motherEmitter, app, isCore, jwt, isModuleUpdate = false }) {
    if (!isCore) {
      throw new Error('[DB MANAGER] Must be loaded as a core module.');
    }
    if (!jwt) {
      throw new Error('[DB MANAGER] initialization requires a valid JWT token.');
    }
    if (!motherEmitter) {
      throw new Error('[DB MANAGER] motherEmitter missing.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    notificationEmitter.notify({
      moduleName: MODULE_NAME,
      notificationType: 'system',
      priority: 'info',
      message: '[DB MANAGER] Initializing Database Manager Module...'
    });

    // Register meltdown events
    registerCreateDatabaseEvent(motherEmitter);
    registerPerformDbOperationEvent(motherEmitter);
    registerHighLevelCrudEvents(motherEmitter);
    registerApplySchemaFileEvent(motherEmitter);
    registerApplySchemaDefinitionEvent(motherEmitter);

    // Possibly check/create "databaseManager" shared schema
    if (!isModuleUpdate) await initializeDatabaseManagerDatabase(motherEmitter, jwt);

    notificationEmitter.notify({
      moduleName: MODULE_NAME,
      notificationType: 'system',
      priority: 'info',
      message: `[DB MANAGER] Database Manager Module initialized. Using DB type="${getDbType()}".`
    });
  }
};
