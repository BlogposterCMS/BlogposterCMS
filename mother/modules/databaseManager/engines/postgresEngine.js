/**
 * mother/modules/databaseManager/engines/postgresEngine.js
 *
 * Logic for creating/fixing a dedicated DB, or a schema in the main DB,
 * plus performing normal queries or placeholders.
 */
const { Pool } = require('pg');
const { adminPool } = require('../helpers/adminPool');
const { generateUserAndPass } = require('../helpers/cryptoHelpers');
const { pgHost, pgPort, pgMainDb, pgMainUser, pgMainPass } = require('../config/databaseConfig');
const { handlePlaceholder } = require('../placeholders/handlePlaceholder');

// --- NEW: notificationEmitter for typed notifications! ---
const notificationEmitter = require('../../../emitters/notificationEmitter');

/* ------------------------------------------------------------------
   1) CREATE/FIX => "own DB" approach
   ------------------------------------------------------------------ */
async function createOrFixPostgresDatabaseForOwnModule(moduleName) {
  const dbName = `${moduleName.toLowerCase()}_db`.substring(0, 63);

  let moduleCreds = generateUserAndPass(moduleName);
  let dbUser, dbPassword;
  if (!moduleCreds) {
    // means it's 'databasemanager'
    dbUser = (process.env.PG_ADMIN_USER || '').toLowerCase();
    dbPassword = process.env.PG_ADMIN_PASSWORD || '';
  } else {
    dbUser = moduleCreds.user;
    dbPassword = moduleCreds.pass;
  }

  try {
    // Check existence
    const exists = await checkIfDbExists(dbName);
    if (!exists) {
      await adminPool.query(`CREATE DATABASE "${dbName}"`);
      notificationEmitter.notify({
        moduleName: 'databaseManager',
        notificationType: 'system',
        priority: 'info',
        message: `Created new Postgres DB "${dbName}".`
      });
    } else {
      notificationEmitter.notify({
        moduleName: 'databaseManager',
        notificationType: 'debug',
        priority: 'debug',
        message: `Database "${dbName}" already exists.`
      });
    }

    // If not 'databasemanager', create user & fix ownership
    if (moduleName.toLowerCase() !== 'databasemanager') {
      const userExists = await checkIfUserExists(dbUser);
      if (!userExists) {
        await adminPool.query(`CREATE USER "${dbUser}" WITH ENCRYPTED PASSWORD '${dbPassword}';`);
        notificationEmitter.notify({
          moduleName: 'databaseManager',
          notificationType: 'system',
          priority: 'info',
          message: `Created Postgres user "${dbUser}" for DB "${dbName}".`
        });
      }
      await adminPool.query(`
        ALTER DATABASE "${dbName}" OWNER TO "${dbUser}";
        GRANT CREATE ON DATABASE "${dbName}" TO "${dbUser}";
        GRANT TEMPORARY ON DATABASE "${dbName}" TO "${dbUser}";
        GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${dbUser}";
      `);
    }
  } catch (err) {
    notificationEmitter.notify({
      moduleName: 'databaseManager',
      notificationType: 'system',
      priority: 'critical',
      message: `Failed to create/fix DB for module "${moduleName}": ${err.message}`
    });
    throw err;
  }
  return {
    user: dbUser,
    password: dbPassword,
    host: pgHost,
    database: dbName,
    port: pgPort
  };
}

/* ------------------------------------------------------------------
   2) CREATE/FIX => "shared DB + schema" approach
   ------------------------------------------------------------------ */
async function createOrFixSchemaInMainDb(moduleName) {
  const schemaName = moduleName.toLowerCase();

  // Connect as admin
  try {
    const client = await adminPool.connect();
    const dbExistsRes = await client.query('SELECT 1 FROM pg_database WHERE datname = $1;', [pgMainDb]);
    if (dbExistsRes.rows.length === 0) {
      await client.query(`CREATE DATABASE "${pgMainDb}"`);
      notificationEmitter.notify({
        moduleName: 'databaseManager',
        notificationType: 'system',
        priority: 'info',
        message: `Created main DB "${pgMainDb}".`
      });
    }
    await client.release();

    // Now connect as admin to main DB
    const { Pool } = require('pg');
    const mainPool = new Pool({
      user: (process.env.PG_ADMIN_USER || '').toLowerCase(),
      password: process.env.PG_ADMIN_PASSWORD || '',
      host: pgHost,
      port: pgPort,
      database: pgMainDb
    });
    const mainClient = await mainPool.connect();

    // Create schema if not exists
    const schemaExistsRes = await mainClient.query(
      'SELECT 1 FROM pg_namespace WHERE nspname = $1;',
      [schemaName]
    );
    if (schemaExistsRes.rows.length === 0) {
      await mainClient.query(`CREATE SCHEMA "${schemaName}";`);
      notificationEmitter.notify({
        moduleName: 'databaseManager',
        notificationType: 'info',
        priority: 'info',
        message: `Created schema "${schemaName}" in DB "${pgMainDb}".`
      });
    } else {
      notificationEmitter.notify({
        moduleName: 'databaseManager',
        notificationType: 'debug',
        priority: 'debug',
        message: `Schema "${schemaName}" already exists in DB "${pgMainDb}".`
      });
    }

    await mainClient.query(`ALTER SCHEMA "${schemaName}" OWNER TO "${pgMainUser}";`);
    await mainClient.release();
    await mainPool.end();
  } catch (err) {
    notificationEmitter.notify({
      moduleName: 'databaseManager',
      notificationType: 'system',
      priority: 'critical',
      message: `Failed to create/fix schema in main DB for module "${moduleName}": ${err.message}`
    });
    throw err;
  }
}

/* ------------------------------------------------------------------
   3) performPostgresOperation
   ------------------------------------------------------------------ */
async function performPostgresOperation(moduleName, operation, params, isOwnDb) {
  try {
    // Check placeholders
    if (typeof operation === 'string') {
      if (await isPlaceholderOperation(operation)) {
        const pool = getGlobalMainDbPool();
        const client = await pool.connect();
        try {
          const result = await handlePlaceholder(client, 'postgres', operation, params);
          return result;
        } finally {
          client.release();
        }
      }
    }

    // Not a recognized placeholder => normal SQL
    if (isOwnDb) {
      const dbName = `${moduleName.toLowerCase()}_db`;
      let moduleCreds = generateUserAndPass(moduleName);
      let dbUser, dbPassword;
      if (!moduleCreds) {
        dbUser = (process.env.PG_ADMIN_USER || '').toLowerCase();
        dbPassword = process.env.PG_ADMIN_PASSWORD || '';
      } else {
        dbUser = moduleCreds.user;
        dbPassword = moduleCreds.pass;
      }

      const dbPool = new Pool({
        user: dbUser,
        host: pgHost,
        database: dbName,
        password: dbPassword,
        port: pgPort
      });
      const client = await dbPool.connect();
      try {
        const result = await client.query(operation, params);
        return result;
      } finally {
        client.release();
        dbPool.end();
      }
    } else {
      const pool = getGlobalMainDbPool();
      const client = await pool.connect();
      try {
        const result = await client.query(operation, params);
        return result;
      } finally {
        client.release();
      }
    }
  } catch (err) {
    // New: Send CRITICAL notification if something fails
    notificationEmitter.notify({
      moduleName: moduleName || 'databaseManager',
      notificationType: 'system',
      priority: 'critical',
      message: `Error performing Postgres operation for "${moduleName}": ${err.message}`
    });
    throw err;
  }
}

/* ------------------------------------------------------------------
   4) Utility
   ------------------------------------------------------------------ */
async function checkIfDbExists(dbName) {
  const res = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1;', [dbName.toLowerCase()]);
  return res.rows.length > 0;
}
async function checkIfUserExists(dbUser) {
  const res = await adminPool.query('SELECT 1 FROM pg_roles WHERE rolname = $1;', [dbUser]);
  return res.rows.length > 0;
}
let globalMainPool = null;
function getGlobalMainDbPool() {
  if (!globalMainPool) {
    globalMainPool = new Pool({
      user: pgMainUser,
      password: pgMainPass,
      host: pgHost,
      port: pgPort,
      database: pgMainDb,
      max: 10
    });
    notificationEmitter.notify({
      moduleName: 'databaseManager',
      notificationType: 'debug',
      priority: 'debug',
      message: `[PostgresEngine] Created global main DB pool => ${pgMainDb}`
    });
  }
  return globalMainPool;
}

async function isPlaceholderOperation(op) {
  const { getCustomPlaceholder } = require('../placeholders/placeholderRegistry');
  const builtIns = require('../placeholders/builtinPlaceholders');
  if (builtIns.includes(op)) return true;
  if (getCustomPlaceholder(op)) return true;
  return false;
}

module.exports = {
  createOrFixPostgresDatabaseForOwnModule,
  createOrFixSchemaInMainDb,
  performPostgresOperation
};
