

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

/**
 * mother/modules/dependencyLoader/dependencyLoaderService.js
 *
 * Provides functions to:
 *   1) ensureDependencyLoaderDatabase => meltdown => createDatabase
 *   2) ensureDependencyLoaderSchemaAndTable => meltdown => dbUpdate placeholders
 *   3) loadDependencies => meltdown => dbSelect
 *   4) checkAndLoadDependency => checks global cache
 *
 * We remain DB-agnostic. Because life is short, but meltdown is forever.
 */

require('dotenv').config();

/**
 * ensureDependencyLoaderDatabase:
 *  1) meltdown => dbSelect => placeholder: 'CHECK_DB_EXISTS_DEPENDENCYLOADER'
 *  2) If not found => meltdown => createDatabase => creates it
 *  3) If found => meltdown => createDatabase => fixes ownership, etc.
 */
async function ensureDependencyLoaderDatabase(motherEmitter, jwt) {
  console.log('[DEPENDENCY LOADER SERVICE] Checking or creating "dependencyloader_db"...');
  const dbName = 'dependencyloader_db';
  let rows;
  try {
    const result = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
      jwt,
      moduleName: 'dependencyLoader',
      moduleType: 'core',
      table: '__rawSQL__',
      data: { rawSQL: 'CHECK_DB_EXISTS_DEPENDENCYLOADER', dbName }
    });
    rows = Array.isArray(result) ? result : result?.rows || [];
  } catch (err) {
    console.error('[DEPENDENCY LOADER SERVICE] Error checking existence of dependencyloader_db:', err.message);
    throw err;
  }

  const creating = rows.length === 0;
  console.log(creating
    ? '[DEPENDENCY LOADER SERVICE] dependencyloader_db does not exist. Creating...'
    : '[DEPENDENCY LOADER SERVICE] dependencyloader_db already exists. Ensuring ownership...');
  try {
    await requestBackendEvent(motherEmitter, BACKEND_EVENTS.CREATE_DATABASE, {
      jwt,
      moduleName: 'dependencyLoader',
      moduleType: 'core',
      targetDbName: dbName,
      ...(!creating ? { fixOwnership: true } : {})
    });
    console.log(creating
      ? '[DEPENDENCY LOADER SERVICE] dependencyloader_db created successfully.'
      : '[DEPENDENCY LOADER SERVICE] Ownership fixed for dependencyloader_db (if needed).');
  } catch (err) {
    console.error(creating
      ? '[DEPENDENCY LOADER SERVICE] Error creating dependencyloader_db:'
      : '[DEPENDENCY LOADER SERVICE] Error ensuring ownership for dependencyloader_db:', err.message);
    throw err;
  }
}

/**
 * ensureDependencyLoaderSchemaAndTable:
 *   1) meltdown => dbUpdate => placeholder => 'INIT_DEPENDENCYLOADER_SCHEMA'
 *   2) meltdown => dbUpdate => placeholder => 'INIT_DEPENDENCYLOADER_TABLE'
 */
async function ensureDependencyLoaderSchemaAndTable(motherEmitter, jwt) {
  console.log('[DEPENDENCY LOADER SERVICE] Creating schema & table for "dependencyloader"...');
  try {
    await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
      jwt,
      moduleName: 'dependencyLoader',
      moduleType: 'core',
      table: '__rawSQL__',
      where: {},
      data: { rawSQL: 'INIT_DEPENDENCYLOADER_SCHEMA' }
    });
    console.log('[DEPENDENCY LOADER SERVICE] Schema "dependencyloader" ensured.');
  } catch (err) {
    console.error('[DEPENDENCY LOADER SERVICE] Error creating schema "dependencyloader":', err.message);
    throw err;
  }

  try {
    await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
      jwt,
      moduleName: 'dependencyLoader',
      moduleType: 'core',
      table: '__rawSQL__',
      where: {},
      data: { rawSQL: 'INIT_DEPENDENCYLOADER_TABLE' }
    });
    console.log('[DEPENDENCY LOADER SERVICE] "dependencyloader".module_dependencies table ensured.');
  } catch (err) {
    console.error('[DEPENDENCY LOADER SERVICE] Error creating "module_dependencies" table:', err.message);
    throw err;
  }
}

/**
 * loadDependencies:
 *  meltdown => dbSelect => 'LIST_DEPENDENCYLOADER_DEPENDENCIES'
 *  bridging returns array of { module_name, dependency_name, allowed_version }
 *  We stuff them into global.allowedDependencies
 */
function loadDependencies(motherEmitter, jwt) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
  jwt,
  moduleName: 'dependencyLoader',
  moduleType: 'core',
  table: '__rawSQL__',
  data: {
    rawSQL: 'LIST_DEPENDENCYLOADER_DEPENDENCIES'
  }
}).then(result => {
  const rows = Array.isArray(result) ? result : result?.rows || [];

  // Rebuild global cache
  // Rebuild global cache
  global.allowedDependencies = {};
  rows.forEach(row => {
    const mName = row.module_name;
    if (!global.allowedDependencies[mName]) {
      global.allowedDependencies[mName] = [];
    }
    global.allowedDependencies[mName].push({
      dependencyName: row.dependency_name,
      allowedVersion: row.allowed_version
    });
  });
  console.log('[DEPENDENCY LOADER SERVICE] Allowed dependencies loaded into global cache.');
  return;
}, err => {
  console.error('[DEPENDENCY LOADER SERVICE] Error loading dependencies:', err.message);
  throw err;
});
}

/**
 * checkAndLoadDependency:
 *  checks if "dependencyName" is allowed for "moduleName"
 *  in global.allowedDependencies
 */
async function checkAndLoadDependency(motherEmitter, moduleName, dependencyName) {
  if (!global.allowedDependencies) {
    console.warn('[DEPENDENCY LOADER SERVICE] Allowed dependencies not loaded => returning false');
    return false;
  }
  const allowedForModule = global.allowedDependencies[moduleName] || [];
  const found = allowedForModule.find((dep) => dep.dependencyName === dependencyName);

  if (found) {
    console.log(`[DEPENDENCY LOADER SERVICE] Module "${moduleName}" is allowed to load "${dependencyName}".`);
    return true;
  } else {
    console.warn(`[DEPENDENCY LOADER SERVICE] Module "${moduleName}" is NOT allowed to load "${dependencyName}".`);
    return false;
  }
}

module.exports = {
  ensureDependencyLoaderDatabase,
  ensureDependencyLoaderSchemaAndTable,
  loadDependencies,
  checkAndLoadDependency,
};
