/**
 * mother/modules/databaseManager/engines/sqliteEngine.js
 *
 * Provides minimal SQLite support for BlogposterCMS.
 * Creates database files per module and performs basic SQL operations.
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const {
  sqliteStorage,
  sqliteMainFile
} = require('../config/databaseConfig');
const { sanitizeModuleName } = require('../../../utils/moduleUtils');
const notificationEmitter = require('../../../emitters/notificationEmitter');
const builtinPlaceholders = require('../placeholders/builtinPlaceholders');
const { getCustomPlaceholder } = require('../placeholders/placeholderRegistry');
const { handlePlaceholder } = require('../placeholders/handlePlaceholder');
const { promisify } = require('util');

function promisifyDbMethods(db) {
  return {
    run: (...args) => new Promise((resolve, reject) => {
      db.run(...args, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    }),
    exec: (sql) => new Promise((resolve, reject) => db.exec(sql, err => err ? reject(err) : resolve())),
    get: (...args) => new Promise((resolve, reject) => db.get(...args, (err, row) => err ? reject(err) : resolve(row))),
    all: (...args) => new Promise((resolve, reject) => db.all(...args, (err, rows) => err ? reject(err) : resolve(rows))),
    close: () => new Promise((resolve, reject) => db.close(err => err ? reject(err) : resolve()))
  };
}

function getDbPath(moduleName, isOwnDb) {
  const safeName = sanitizeModuleName(moduleName).toLowerCase();
  const file = isOwnDb ? `${safeName}.sqlite` : sqliteMainFile;
  return path.resolve(sqliteStorage, file);
}

function ensureDbFile(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (!fs.existsSync(dbPath)) {
    fs.closeSync(fs.openSync(dbPath, 'w'));
  }
}

async function createOrFixSqliteDatabaseForModule(moduleName, isOwnDb) {
  const dbPath = getDbPath(moduleName, isOwnDb);
  ensureDbFile(dbPath);
  notificationEmitter.notify({
    moduleName: 'databaseManager',
    notificationType: 'info',
    priority: 'info',
    message: `[SQLiteEngine] Using database at ${dbPath}`
  });
  return { dbPath };
}

function performSqliteOperation(moduleName, operation, params = [], isOwnDb) {
  return new Promise((resolve, reject) => {
    const dbPath = getDbPath(moduleName, isOwnDb);
    const rawDb = new sqlite3.Database(
      dbPath,
      sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
      async err => {
        if (err) return reject(err);

        const db = promisifyDbMethods(rawDb);

        try {
          if (typeof operation === 'string' && await isPlaceholderOperation(operation)) {
            const result = await handlePlaceholder(db, 'sqlite', operation, params);
            await db.close();
            return resolve(result);
          }

          const rows = await db.all(operation, params);
          await db.close();
          resolve({ rows });
        } catch (e) {
          await db.close().catch(() => {});
          reject(e);
        }
      }
    );
  });
}

function isPlaceholderOperation(op) {
  if (builtinPlaceholders.includes(op)) return true;
  if (getCustomPlaceholder(op)) return true;
  return false;
}

module.exports = {
  createOrFixSqliteDatabaseForModule,
  performSqliteOperation
};
