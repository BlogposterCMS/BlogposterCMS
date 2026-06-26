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

function parseAppInfo(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (typeof value === 'object') return value;
  return {};
}

function normalizeRegistryBoolean(value) {
  if (value === true || value === 1 || value === '1') return true;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

function normalizeAppRegistryRow(row = {}) {
  const appInfo = parseAppInfo(row.app_info ?? row.appInfo);
  const isActive = normalizeRegistryBoolean(row.is_active ?? row.isActive);
  const appName = row.app_name ?? row.appName ?? appInfo.name ?? null;
  const lastError = row.last_error ?? row.lastError ?? null;
  return {
    ...row,
    app_name: appName,
    appName,
    is_active: isActive,
    isActive,
    last_error: lastError,
    lastError,
    app_info: appInfo,
    appInfo
  };
}

function normalizeAppRegistryRows(result) {
  const rows = Array.isArray(result) ? result : (result?.rows || []);
  return rows.map(normalizeAppRegistryRow);
}

async function getAppRegistryEntry(motherEmitter, jwt, appName) {
  const rows = await runDbSelectPlaceholder(motherEmitter, jwt, 'SELECT_APP_BY_NAME', { appName });
  return normalizeAppRegistryRows(rows)[0] || null;
}

async function listAppRegistry(motherEmitter, jwt) {
  const rows = await runDbSelectPlaceholder(motherEmitter, jwt, 'LIST_APP_REGISTRY', {});
  return normalizeAppRegistryRows(rows);
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
  getAppRegistryEntry,
  listAppRegistry,
  normalizeAppRegistryRows,
  registerOrUpdateApp,
  runDbUpdatePlaceholder,
  runDbSelectPlaceholder
};
