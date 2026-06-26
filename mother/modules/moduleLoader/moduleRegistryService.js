/**
 * mother/modules/moduleLoader/moduleRegistryService.js
 *
 * Provides meltdown event logic for the "module_registry".
 * We ensure the schema, handle 'getModuleRegistry', etc.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');

async function ensureModuleRegistrySchema(motherEmitter, jwt) {
  // meltdown => dbUpdate => 'INIT_MODULE_REGISTRY_TABLE'
  await runDbUpdatePlaceholder(motherEmitter, jwt, 'INIT_MODULE_REGISTRY_TABLE', {});

  // meltdown => dbSelect => check columns
  const existingCols = await getExistingColumns(motherEmitter, jwt, {
    rawSQLPlaceholder: 'CHECK_MODULE_REGISTRY_COLUMNS',
    schemaName: 'public',
    tableName: 'module_registry'
  });

  const neededAlters = [];
  if (!existingCols.includes('module_info')) neededAlters.push('module_info');
  if (!existingCols.includes('created_at'))  neededAlters.push('created_at');
  if (!existingCols.includes('updated_at'))  neededAlters.push('updated_at');

  if (neededAlters.length > 0) {
    await runDbUpdatePlaceholder(motherEmitter, jwt, 'ALTER_MODULE_REGISTRY_COLUMNS', {
      columnsToAdd: neededAlters
    });
  }

  console.log('[MODULE LOADER] module_registry schema ensured/updated (placeholder approach).');
}

/**
 * meltdown => "getModuleRegistry"
 */
function initGetModuleRegistryEvent(motherEmitter) {
  motherEmitter.on('getModuleRegistry', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    if (!payload || typeof payload !== 'object') {
      return callback(new Error('[MODULE LOADER] getModuleRegistry => invalid meltdown payload.'));
    }
    const { jwt, moduleName, moduleType } = payload;
    if (!jwt || moduleName !== 'moduleLoader' || moduleType !== 'core') {
      return callback(new Error('[MODULE LOADER] meltdown => must come from moduleLoader+core.'));
    }

    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'modules.list')) {
      return callback(new Error('Forbidden – missing permission: modules.list'));
    }

    try {
      const rows = await runDbSelectPlaceholder(motherEmitter, jwt, 'SELECT_MODULE_REGISTRY', {});

      // Compare DB vs local moduleInfo.json if you want auto-sync
      for (const row of rows) {
        let dbInfo = (typeof row.module_info === 'string')
          ? safelyParseJSON(row.module_info) || {}
          : row.module_info || {};

        const fsInfo = readFsModuleInfo(row.module_name);
        const dbString = JSON.stringify(dbInfo);
        const fsString = fsInfo ? JSON.stringify(fsInfo) : null;

        if (fsInfo && fsString !== dbString) {
          console.log(`[MODULE LOADER] Detected changed moduleInfo.json for "${row.module_name}". Updating DB...`);
          try {
            await updateModuleInfo(motherEmitter, jwt, row.module_name, fsInfo);
            row.module_info = fsInfo;
          } catch (err) {
            console.error('[MODULE LOADER] Error updating module_info =>', err.message);
          }
        } else {
          row.module_info = fsInfo || dbInfo;
        }
      }

      callback(null, rows);
    } catch (e) {
      console.error('[MODULE LOADER] Error in getModuleRegistry =>', e.message);
      callback(e);
    }
  });
}

/**
 * meltdown => "listActiveGrapesModules"
 */
function initListActiveGrapesModulesEvent(motherEmitter) {
  motherEmitter.on('listActiveGrapesModules', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    if (!payload || typeof payload !== 'object') {
      return callback(new Error('[MODULE LOADER] listActiveGrapesModules => invalid meltdown payload.'));
    }
    const { jwt, moduleName, moduleType } = payload;
    if (!jwt || moduleName !== 'moduleLoader' || moduleType !== 'core') {
      return callback(new Error('[MODULE LOADER] meltdown => must come from moduleLoader/core.'));
    }

    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'modules.listActive')) {
      return callback(new Error('Forbidden – missing permission: modules.listActive'));
    }

    try {
      const rows = await runDbSelectPlaceholder(motherEmitter, jwt, 'LIST_ACTIVE_GRAPES_MODULES', {});
      const result = rows.map(r => {
        let info = (typeof r.module_info === 'string')
          ? safelyParseJSON(r.module_info) || {}
          : r.module_info || {};
        return {
          module_name: r.module_name,
          moduleInfo: info
        };
      });

      callback(null, result);
    } catch (err) {
      console.error('[MODULE LOADER] listActiveGrapesModules => meltdown meltdown =>', err.message);
      callback(err);
    }
  });
}

/**
 * meltdown => "listSystemModules"
 */
function initListSystemModulesEvent(motherEmitter) {
  motherEmitter.on('listSystemModules', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    if (!payload || typeof payload !== 'object') {
      return callback(new Error('[MODULE LOADER] listSystemModules => invalid meltdown payload.'));
    }
    const { jwt, moduleName, moduleType } = payload;
    if (!jwt || moduleName !== 'moduleLoader' || moduleType !== 'core') {
      return callback(new Error('[MODULE LOADER] meltdown => must come from moduleLoader/core.'));
    }

    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'modules.list')) {
      return callback(new Error('Forbidden – missing permission: modules.list'));
    }

    try {
      const modulesDir = path.resolve(__dirname, '..');
      const folders = fs
        .readdirSync(modulesDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      const result = folders.map(folder => {
        const infoPath = path.join(modulesDir, folder, 'moduleInfo.json');
        let info = {};
        if (fs.existsSync(infoPath)) {
          try {
            info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
          } catch (err) {
            console.warn(`[MODULE LOADER] Error reading moduleInfo.json for "${folder}": ${err.message}`);
          }
        }
        if (!info.moduleName) info.moduleName = folder;
        if (!info.version) info.version = '';
        if (!info.description) info.description = '';
        return { module_name: folder, moduleInfo: info };
      });

      callback(null, result);
    } catch (err) {
      console.error('[MODULE LOADER] listSystemModules => meltdown meltdown =>', err.message);
      callback(err);
    }
  });
}

function readFsModuleInfo(moduleName) {
  try {
    const modulesDir = path.resolve(__dirname, '../../../modules');
    const infoPath   = path.join(modulesDir, moduleName, 'moduleInfo.json');
    if (!fs.existsSync(infoPath)) return null;
    const raw = fs.readFileSync(infoPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[MODULE LOADER] readFsModuleInfo => ${moduleName}:`, err.message);
    return null;
  }
}

function updateModuleInfo(motherEmitter, jwt, moduleName, newInfo) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(
      'dbUpdate',
      {
        jwt,
        moduleName: 'moduleLoader',
        moduleType: 'core',
        table: 'module_registry',
        where: { module_name: moduleName },
        data: {
          module_info: JSON.stringify(newInfo),
          updated_at : new Date().toISOString()
        }
      },
      (err) => {
        if (err) {
          console.error(`[MODULE LOADER] Error updating module_info for ${moduleName}:`, err.message);
          return reject(err);
        }
        resolve();
      }
    );
  });
}

/**
 * meltdown => 'getModuleRegistry'
 */
function getModuleRegistry(motherEmitter, jwt) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(
      'getModuleRegistry',
      { jwt, moduleName: 'moduleLoader', moduleType: 'core' },
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

/**
 * meltdown => 'dbInsert' => insert into module_registry
 */
function insertModuleRegistryEntry(motherEmitter, jwt, moduleName, isActive, lastError, moduleInfo) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(
      'dbInsert',
      {
        jwt,
        moduleName : 'moduleLoader',
        moduleType : 'core',
        table      : 'module_registry',
        data       : {
          module_name : moduleName,
          is_active   : isActive,
          last_error  : lastError,
          module_info : JSON.stringify(moduleInfo || {}),
          created_at  : new Date().toISOString(),
          updated_at  : new Date().toISOString()
        }
      },
      (err) => {
        if (err) {
          console.error(`[MODULE LOADER] Error inserting registry entry for ${moduleName}:`, err.message);
          return reject(err);
        }
        resolve();
      }
    );
  });
}

/**
 * meltdown => 'dbUpdate' => set last_error, possibly is_active
 */
function updateModuleLastError(motherEmitter, jwt, moduleName, lastError) {
  return new Promise((resolve, reject) => {
    const dataObj = {
      last_error: lastError,
      updated_at: new Date().toISOString()
    };
    if (lastError === null) {
      dataObj.is_active = true;
    }

    motherEmitter.emit(
      'dbUpdate',
      {
        jwt,
        moduleName : 'moduleLoader',
        moduleType : 'core',
        table      : 'module_registry',
        where      : { module_name: moduleName },
        data       : dataObj
      },
      (err) => {
        if (err) {
          console.error(
            `[MODULE LOADER] Error updating last_error for %s: %s`,
            moduleName,
            err.message
          );
          return reject(err);
        }
        resolve();
      }
    );
  });
}

function deactivateModule(motherEmitter, jwt, moduleName, errMsg) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(
      'dbUpdate',
      {
        jwt,
        moduleName : 'moduleLoader',
        moduleType : 'core',
        table      : 'module_registry',
        where      : { module_name: moduleName },
        data       : {
          is_active  : false,
          last_error : errMsg,
      updated_at : new Date().toISOString()
        }
      },
        (err) => {
          if (err) {
            console.error(
              `[MODULE LOADER] Error deactivating module %s: %s`,
              moduleName,
              err.message
            );
            return reject(err);
          }
          resolve();
        }
    );
  });
}

/**
 * A convenience method that does:
 *   - If the module is missing => insert it
 *   - Else => compare & update info
 */
async function registerOrUpdateModule(motherEmitter, jwt, moduleName, moduleInfo) {
  const existingModules = await runDbSelectPlaceholder(
    motherEmitter,
    jwt,
    'SELECT_MODULE_BY_NAME',
    { moduleName }
  );
  if (existingModules.length === 0) {
    // Not in DB => insert
    await insertModuleRegistryEntry(motherEmitter, jwt, moduleName, true, null, moduleInfo);
    console.log(`[MODULE LOADER] ✅ Module "${moduleName}" inserted successfully.`);
  } else {
    // Compare existing module_info
    const existingInfo = existingModules[0].module_info;
    const existingInfoString = JSON.stringify(existingInfo);
    const newInfoString = JSON.stringify(moduleInfo);

    if (existingInfoString !== newInfoString) {
      await updateModuleInfo(motherEmitter, jwt, moduleName, moduleInfo);
      console.log(`[MODULE LOADER] 🔄 Module "${moduleName}" updated in DB.`);
    } else {
      console.log(`[MODULE LOADER] ℹ️ Module "${moduleName}" is already up to date.`);
    }
  }
}

/**
 * runDbUpdatePlaceholder, runDbSelectPlaceholder => meltdown bridging
 */
function runDbUpdatePlaceholder(motherEmitter, jwt, rawSQLPlaceholder, dataObj) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(
      'dbUpdate',
      {
        jwt,
        moduleName: 'moduleLoader',
        moduleType: 'core',
        table: '__rawSQL__',
        where: {},
        data: {
          rawSQL: rawSQLPlaceholder,
          ...dataObj
        }
      },
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

function runDbSelectPlaceholder(motherEmitter, jwt, rawSQLPlaceholder, dataObj) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(
      'dbSelect',
      {
        jwt,
        moduleName: 'moduleLoader',
        moduleType: 'core',
        table: '__rawSQL__',
        data: {
          rawSQL: rawSQLPlaceholder,
          ...dataObj
        }
      },
      (err, result) => {
        if (err) return reject(err);
        const rows = Array.isArray(result) ? result : (result?.rows || []);
        resolve(rows);
      }
    );
  });
}

async function getExistingColumns(motherEmitter, jwt, dataObj) {
  const rows = await runDbSelectPlaceholder(
    motherEmitter,
    jwt,
    dataObj.rawSQLPlaceholder,
    dataObj
  );
  return rows.map(r => r.column_name);
}

function safelyParseJSON(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

module.exports = {
  ensureModuleRegistrySchema,
  initGetModuleRegistryEvent,
  initListActiveGrapesModulesEvent,
  initListSystemModulesEvent,
  readFsModuleInfo,
  updateModuleInfo,
  getModuleRegistry,
  insertModuleRegistryEntry,
  updateModuleLastError,
  deactivateModule,
  registerOrUpdateModule,
  // bridging
  runDbUpdatePlaceholder,
  runDbSelectPlaceholder,
  getExistingColumns,
  safelyParseJSON
};
