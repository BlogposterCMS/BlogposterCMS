"use strict";

async function ensureAppRegistrySchema(motherEmitter, jwt) {
  if (typeof motherEmitter.listenerCount === 'function' && motherEmitter.listenerCount('dbUpdate') === 0) {
    return; // allows tests to run with a minimal emitter
  }
  await runDbUpdatePlaceholder(motherEmitter, jwt, 'INIT_APP_REGISTRY_TABLE', {});
}

async function registerOrUpdateApp(motherEmitter, jwt, appName, appInfo, isActive, lastError) {
  const rows = await runDbSelectPlaceholder(motherEmitter, jwt, 'SELECT_APP_BY_NAME', { appName });
  const data = {
    appName,
    isActive: !!isActive,
    lastError: lastError || null,
    appInfo: JSON.stringify(appInfo || {})
  };
  const placeholder = rows.length === 0 ? 'INSERT_APP_REGISTRY_ENTRY' : 'UPDATE_APP_REGISTRY_ENTRY';
  await runDbUpdatePlaceholder(motherEmitter, jwt, placeholder, data);
}

function runDbUpdatePlaceholder(motherEmitter, jwt, rawSQLPlaceholder, dataObj) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(
      'dbUpdate',
      {
        jwt,
        moduleName: 'appLoader',
        moduleType: 'core',
        table: '__rawSQL__',
        where: {},
        data: { rawSQL: rawSQLPlaceholder, ...dataObj }
      },
      err => err ? reject(err) : resolve()
    );
  });
}

function runDbSelectPlaceholder(motherEmitter, jwt, rawSQLPlaceholder, dataObj) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(
      'dbSelect',
      {
        jwt,
        moduleName: 'appLoader',
        moduleType: 'core',
        table: '__rawSQL__',
        data: { rawSQL: rawSQLPlaceholder, ...dataObj }
      },
      (err, result) => {
        if (err) return reject(err);
        const rows = Array.isArray(result) ? result : (result?.rows || []);
        resolve(rows);
      }
    );
  });
}

module.exports = {
  ensureAppRegistrySchema,
  registerOrUpdateApp,
  runDbUpdatePlaceholder,
  runDbSelectPlaceholder
};
