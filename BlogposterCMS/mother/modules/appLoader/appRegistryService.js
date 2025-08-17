"use strict";

async function ensureAppRegistrySchema(motherEmitter, jwt) {
  if (typeof motherEmitter.listenerCount === 'function' && motherEmitter.listenerCount('dbUpdate') === 0) {
    return; // allows tests to run with a minimal emitter
  }
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS appLoader_app_registry (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name    TEXT UNIQUE NOT NULL,
      is_active   INTEGER DEFAULT 0,
      last_error  TEXT,
      app_info    TEXT DEFAULT '{}',
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await new Promise((resolve, reject) => {
    motherEmitter.emit(
      'performDbOperation',
      {
        jwt,
        moduleName: 'appLoader',
        moduleType: 'core',
        operation: createTableSQL,
        params: []
      },
      err => err ? reject(err) : resolve()
    );
  });
}

async function registerOrUpdateApp(motherEmitter, jwt, appName, appInfo, isActive, lastError) {
  const sql = `
    INSERT INTO appLoader_app_registry (app_name, is_active, last_error, app_info, updated_at)
    VALUES (?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(app_name) DO UPDATE SET
      is_active = excluded.is_active,
      last_error = excluded.last_error,
      app_info = excluded.app_info,
      updated_at = CURRENT_TIMESTAMP;
  `;

  const params = [
    appName,
    isActive ? 1 : 0,
    lastError || null,
    JSON.stringify(appInfo || {})
  ];

  await new Promise((resolve, reject) => {
    motherEmitter.emit(
      'performDbOperation',
      {
        jwt,
        moduleName: 'appLoader',
        moduleType: 'core',
        operation: sql,
        params
      },
      err => err ? reject(err) : resolve()
    );
  });
}

module.exports = {
  ensureAppRegistrySchema,
  registerOrUpdateApp
};
