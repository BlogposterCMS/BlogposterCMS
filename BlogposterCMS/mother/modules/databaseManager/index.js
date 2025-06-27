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

module.exports = {
  async initialize({ motherEmitter, app, isCore, jwt }) {
    if (!isCore) {
      throw new Error('[DB MANAGER] Must be loaded as a core module.');
    }
    if (!jwt) {
      throw new Error('[DB MANAGER] initialization requires a valid JWT token.');
    }

    notificationEmitter.notify({
      moduleName: 'databaseManager',
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
    await initializeDatabaseManagerDatabase(motherEmitter, jwt);

    notificationEmitter.notify({
      moduleName: 'databaseManager',
      notificationType: 'system',
      priority: 'info',
      message: `[DB MANAGER] Database Manager Module initialized. Using DB type="${getDbType()}".`
    });
  }
};
