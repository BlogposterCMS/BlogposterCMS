/**
 * mother/modules/databaseManager/meltdownBridging/createDatabaseEvent.js
 *
 * meltdown => "createDatabase"
 */
const { getEngine } = require('../engines/engineFactory');
const { moduleHasOwnDb } = require('../helpers/dbTypeHelpers');
const { createOrFixSchemaInMainDb } = require('../engines/postgresEngine');
const { createMongoDatabase } = require('../engines/mongoEngine');
const { getDbType } = require('../helpers/dbTypeHelpers');
const { onceCallback } = require('../../../emitters/motherEmitter');

// NEW: Notification Emitter for typed notifications
const notificationEmitter = require('../../../emitters/notificationEmitter');

const TIMEOUT_DURATION = 5000;

function registerCreateDatabaseEvent(motherEmitter) {
  // meltdown => createDatabase
  motherEmitter.on('createDatabase', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    const timeout = setTimeout(() => {
      const errMsg = `[DB MANAGER] Timeout while creating database for ${payload.moduleName}.`;
      notificationEmitter.notify({
        moduleName: 'databaseManager',
        notificationType: 'system',
        priority: 'critical',
        message: errMsg
      });
      callback(new Error('Timeout while creating database'));
    }, TIMEOUT_DURATION);

    try {
      const { moduleName } = payload;
      const engine = getEngine();
      const isOwnDb = moduleHasOwnDb(moduleName);
      const dbType = getDbType();

      if (dbType === 'postgres') {
        if (isOwnDb) {
          await engine.createOrFixPostgresDatabaseForOwnModule(moduleName);
          notificationEmitter.notify({
            moduleName: 'databaseManager',
            notificationType: 'info',
            priority: 'info',
            message: `Successfully created/fixed dedicated Postgres DB for "${moduleName}".`
          });
          callback(null, { success: true, type: 'ownDb' });
        } else {
          // create or fix a shared schema in main DB
          await createOrFixSchemaInMainDb(moduleName);
          notificationEmitter.notify({
            moduleName: 'databaseManager',
            notificationType: 'info',
            priority: 'info',
            message: `Successfully created/fixed shared schema in Postgres main DB for "${moduleName}".`
          });
          callback(null, { success: true, type: 'sharedSchema' });
        }
      } else if (dbType === 'mongodb') {
        await createMongoDatabase(moduleName);
        notificationEmitter.notify({
          moduleName: 'databaseManager',
          notificationType: 'info',
          priority: 'info',
          message: `Successfully created/fixed MongoDB for "${moduleName}".`
        });
        callback(null, { success: true, type: 'mongodb' });
      } else {
        throw new Error(`Unsupported DB type: ${dbType}`);
      }
    } catch (err) {
      notificationEmitter.notify({
        moduleName: 'databaseManager',
        notificationType: 'system',
        priority: 'critical',
        message: `Error creating DB for "${payload.moduleName}": ${err.message}`
      });
      callback(err);
    } finally {
      clearTimeout(timeout);
    }
  });
}

module.exports = { registerCreateDatabaseEvent };
