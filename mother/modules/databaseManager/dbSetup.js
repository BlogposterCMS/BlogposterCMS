/**
 * mother/modules/databaseManager/dbSetup.js
 */
const { Pool } = require('pg');
const { pgAdminUser, pgAdminPass, pgHost, pgPort, pgMainDb } = require('./config/databaseConfig');
const { getDbType } = require('./helpers/dbTypeHelpers');

// NEW: typed notifications
const notificationEmitter = require('../../emitters/notificationEmitter');

async function initializeDatabaseManagerDatabase(motherEmitter, coreToken) {
  notificationEmitter.notify({
    moduleName: 'databaseManager',
    notificationType: 'info',
    priority: 'info',
    message: '[DB MANAGER] Ensuring shared schema for "databaseManager" in the main DB...'
  });

  await new Promise((resolve, reject) => {
    motherEmitter.emit(
      'createDatabase',
      { jwt: coreToken, moduleName: 'databaseManager', moduleType: 'core' },
      (err, result) => {
        if (err) return reject(err);

        notificationEmitter.notify({
          moduleName: 'databaseManager',
          notificationType: 'info',
          priority: 'info',
          message: '[DB MANAGER] Shared schema "databasemanager" creation done (if needed).'
        });
        resolve();
      }
    );
  });

  if (getDbType() === 'postgres') {
    await initializeDatabaseManagerSchemaInMainDb();
  } else {
    notificationEmitter.notify({
      moduleName: 'databaseManager',
      notificationType: 'debug',
      priority: 'debug',
      message: '[DB MANAGER] Skipping Postgres-specific schema setup.'
    });
  }
}

async function initializeDatabaseManagerSchemaInMainDb() {
  const dbClient = new Pool({
    user: pgAdminUser,
    password: pgAdminPass,
    host: pgHost,
    port: pgPort,
    database: pgMainDb
  });
  const client = await dbClient.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "databasemanager"."module_users" (
        id SERIAL PRIMARY KEY,
        module_name VARCHAR(255) UNIQUE NOT NULL,
        db_user VARCHAR(255) NOT NULL,
        db_password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    notificationEmitter.notify({
      moduleName: 'databaseManager',
      notificationType: 'info',
      priority: 'info',
      message: '[DB MANAGER] Table "databasemanager.module_users" ensured successfully.'
    });
  } catch (err) {
    notificationEmitter.notify({
      moduleName: 'databaseManager',
      notificationType: 'system',
      priority: 'critical',
      message: `Failed to ensure "databasemanager.module_users" => ${err.message}`
    });
    throw err;
  } finally {
    client.release();
    dbClient.end();
  }
}

module.exports = {
  initializeDatabaseManagerDatabase
};
