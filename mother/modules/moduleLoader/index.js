/**
 * mother/modules/moduleLoader/index.js
 *
 * New, optimized Module Loader with health checks and auto-retry logic.
 *
 * Highlights:
 * 1) Checks whether modules can initialize cleanly (health check).
 * 2) Runs community modules in an external process boundary.
 * 3) Deactivates malfunctioning modules.
 * 4) After a successful health check, starts a fresh runtime process.
 * 5) Auto-retries previously crashed modules.
 * 6) Optionally serves module-provided static frontends.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// If you have a custom NotificationEmitter, you could integrate it here:
const notificationEmitter = require('../../emitters/notificationEmitter');
const { removeListenersForModule } = require('../../emitters/motherEmitter');

// Safe wrapper to avoid losing critical errors when the emitter is missing
const notify = (payload) => {
  try {
    notificationEmitter.emit('notify', payload);
  } catch (e) {
    console.error('[NOTIFY-FALLBACK]', payload?.message || payload, e?.message);
  }
};

// meltdown registry - database helper utilities
const {
  ensureModuleRegistrySchema,
  initGetModuleRegistryEvent,
  initListActiveStaticFrontendsEvent,
  initListSystemModulesEvent,
  getModuleRegistry,
  insertModuleRegistryEntry,
  updateModuleLastError,
  deactivateModule
} = require('./moduleRegistryService');

const { initModuleRegistryAdminEvents } = require('./moduleRegistryEvents');
const {
  normalizeMountPath,
  resolveStaticAssetDir,
  blockCommunityStaticAssetFiles,
  createCommunityStaticAssetOptions
} = require('./moduleHost');
const {
  assertCommunityModuleFolderShape,
  readCommunityModuleInfo
} = require('./moduleFolderPolicy');
const { CORE_OWNED_MODULE_NAMES } = require('./moduleOwnershipPolicy');
const { sanitizeModuleName } = require('../../utils/moduleUtils');
const {
  buildModuleRuntimeEnv,
  normalizeServiceName,
  readModuleApiDefinition,
  serviceNamesFromApiDefinition
} = require('./moduleRuntimeEnv');
const {
  runCommunityModuleHealthCheck,
  startCommunityModuleProcess
} = require('./moduleProcessRuntime');
const { getGrantedModuleEvents } = require('./moduleAccessPolicy');
const {
  sharedModuleAccessConsentManager
} = require('./moduleAccessConsent');

const RESERVED_CORE_MODULES = CORE_OWNED_MODULE_NAMES;
const MODULE_NAME = 'moduleLoader';
const MODULE_TYPE = 'core';

function normalizeModuleInfo(row) {
  const raw = row?.moduleInfo ?? row?.module_info ?? {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  if (!raw || typeof raw !== 'object') return {};
  return raw;
}

/**
 * Main function that starts the module loader.
 * It performs the following:
 *  - validates the schema,
 *  - initializes events,
 *  - reads the /modules directory,
 *  - registers modules (if new),
 *  - loads active modules and performs auto-retry when needed,
 *  - serves registered frontends (if available).
 */
async function loadAllModules({ emitter, app, jwt }) {
  console.log('[MODULE LOADER] Starting up with enhanced Health Check...');

  const motherEmitter = emitter;
  if (!motherEmitter) {
    throw new Error('[MODULE LOADER] motherEmitter missing.');
  }
  if (typeof motherEmitter.registerModuleType === 'function') {
    motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
  }
  const modulesPath = path.resolve(__dirname, '../../../modules');
  if (process.env.ALLOW_COMMUNITY_APP_ACCESS === 'true') {
    console.warn('[MODULE LOADER] Ignoring ALLOW_COMMUNITY_APP_ACCESS=true; community modules never receive the raw Express app.');
  }

  // Expose a registry of loaded modules for placeholder dispatch
  global.loadedModules = global.loadedModules || {};

  // 1) Ensure the module_registry schema exists
  try {
    await ensureModuleRegistrySchema(motherEmitter, jwt);
  } catch (err) {
    console.error('[MODULE LOADER] Failed to ensure schema:', err.message);
    return;
  }

  // 2) Initialize meltdown events for registry fetch and admin tasks
  initGetModuleRegistryEvent(motherEmitter);
  initListActiveStaticFrontendsEvent(motherEmitter);
  initListSystemModulesEvent(motherEmitter);
  initModuleRegistryAdminEvents(motherEmitter, app);

  // Without a meltdown JWT we cannot load optional modules, so abort early.
  if (!jwt) {
    console.warn('[MODULE LOADER] No meltdown JWT => cannot load optional modules. Doing nothing...');
    return;
  }

  // 3) Check the modules directory
  if (!fs.existsSync(modulesPath)) {
    console.warn('[MODULE LOADER] Optional modules dir not found =>', modulesPath);
    return;
  }

  // 4) Fetch module registry from the database
  let dbRegistry;
  try {
    dbRegistry = await getModuleRegistry(motherEmitter, jwt);
  } catch (err) {
    console.error('[MODULE LOADER] Error fetching module registry =>', err.message);
    return;
  }

  // 5) Scan the modules directory for subfolders
  const allFolderNames = fs
    .readdirSync(modulesPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  const folderNames = allFolderNames.filter(folder => !RESERVED_CORE_MODULES.has(folder));
  const skippedCoreOwnedFolders = allFolderNames.filter(folder => RESERVED_CORE_MODULES.has(folder));
  for (const folder of skippedCoreOwnedFolders) {
    console.log(`[MODULE LOADER] Skipping "${folder}" because it is provided by a core service.`);
  }

  // 6) Insert new modules into the registry
  const knownNames = dbRegistry.map(r => r.module_name);

  for (const folder of folderNames) {
    const moduleFolderPath = path.join(modulesPath, folder);
    let moduleInfo = {};

    try {
      moduleInfo = readCommunityModuleInfo(moduleFolderPath, folder, { modulesRoot: modulesPath });
    } catch (err) {
      console.error(`[MODULE LOADER] Invalid module folder "${folder}": ${err.message}`);
      if (!knownNames.includes(folder)) {
        await insertModuleRegistryEntry(motherEmitter, jwt, folder, false, err.message, {
          moduleName: folder,
          developer: 'Unknown Developer',
          version: '',
          description: ''
        }).catch(e => {
          console.error('[MODULE LOADER] Error inserting invalid module:', e.message);
        });
      } else {
        await deactivateModule(motherEmitter, jwt, folder, err.message).catch(e => {
          console.error('[MODULE LOADER] Error deactivating invalid module:', e.message);
        });
      }
      continue;
    }

    if (!knownNames.includes(folder)) {
      console.log(`[MODULE LOADER] Found new folder "${folder}", inserting into registry...`);
      try {
        await insertModuleRegistryEntry(motherEmitter, jwt, folder, true, null, moduleInfo);
        dbRegistry.push({
          module_name: folder,
          is_active: true,
          last_error: null,
          moduleInfo
        });
      } catch (e) {
        console.error('[MODULE LOADER] Error inserting module:', e.message);
      }
    }
  }

  // 7) PASS #1 => Try loading all active modules
  for (const row of dbRegistry) {
    if (RESERVED_CORE_MODULES.has(row.module_name)) {
      console.log(`[MODULE LOADER] Registry entry "${row.module_name}" is core-owned; skipping optional load.`);
      continue;
    }
    if (row.is_active) {
      await attemptModuleLoad(
        row,
        folderNames,
        modulesPath,
        motherEmitter,
        app,
        jwt,
        false // Normal load, not an auto-retry
      );
    }
  }

  // 8) PASS #2 => Auto-retry previously crashed modules
  for (const row of dbRegistry) {
    if (RESERVED_CORE_MODULES.has(row.module_name)) {
      continue;
    }
    if (!row.is_active && row.last_error && row.last_error.trim() !== '') {
      console.log(`[MODULE LOADER] Auto-retrying "${row.module_name}" => last error: ${row.last_error}`);
      await attemptModuleLoad(
        row,
        folderNames,
        modulesPath,
        motherEmitter,
        app,
        jwt,
        true 
      );
    }
  }

  // 9) Optionally serve module frontends through the same bounded static asset policy.
  for (const row of dbRegistry) {
    try {
      serveStaticFrontend({
        row,
        folderNames,
        modulesPath,
        app
      });
    } catch (err) {
      const moduleName = row?.module_name || 'unknown';
      notify({
        moduleName,
        notificationType: 'system',
        priority: 'error',
        message: `[MODULE LOADER] Failed to serve static frontend for "${moduleName}": ${err.message}`
      });
    }
  }

  console.log('[MODULE LOADER] All optional modules loaded / retried successfully. The meltdown continues.');
}

function serveStaticFrontend({ row, folderNames = [], modulesPath, app }) {
  if (!row || !row.is_active || !app || typeof app.use !== 'function') return false;

  const moduleName = sanitizeModuleName(row.module_name);
  if (RESERVED_CORE_MODULES.has(moduleName)) return false;
  if (!folderNames.includes(moduleName)) return false;

  const rowModuleInfo = normalizeModuleInfo(row);
  if (rowModuleInfo.staticFrontend !== true) return false;

  const modulePath = path.join(modulesPath, moduleName);
  const frontendPath = path.join(modulePath, 'frontend');
  if (!fs.existsSync(frontendPath)) return false;

  const checkedModulePath = assertCommunityModuleFolderShape(modulePath, moduleName, { modulesRoot: modulesPath });
  const root = resolveStaticAssetDir(checkedModulePath, 'frontend');
  const mountPath = normalizeMountPath(moduleName, '/');
  const express = require('express');
  app.use(mountPath, blockCommunityStaticAssetFiles, express.static(root, createCommunityStaticAssetOptions()));
  console.log(`[MODULE LOADER] Serving static frontend for module: ${moduleName}`);
  return { moduleName, mountPath, dir: root };
}

/**
 * attemptModuleLoad: tries to load a single module with a preceding health check.
 * - Starts the module in an external process for a health check
 * - On error -> deactivate module and remove event listeners
 * - On success -> starts a fresh runtime process with scoped host IPC
 * - On auto-retry -> reactivate the module in the database
 */
async function attemptModuleLoad(
  registryRow,
  folderNames,
  modulesPath,
  motherEmitter,
  app,
  jwt,
  isAutoRetry
) {
  const { module_name: moduleName } = registryRow;
  const moduleInfo = normalizeModuleInfo(registryRow);
  const accessGrants = getGrantedModuleEvents(moduleInfo);
  const nonce = crypto.randomBytes(16).toString('hex');

  // Does the folder still exist?
  if (!folderNames.includes(moduleName)) {
    console.warn(`[MODULE LOADER] No folder => ${moduleName}. Possibly was deleted.`);
    sharedModuleAccessConsentManager.rejectAllForModule(moduleName, 'Module folder missing.');
    return false;
  }

  // Force "community" as the module type
  motherEmitter.registerModuleType(moduleName, 'community');

  const moduleFolderPath = path.join(modulesPath, moduleName);
  try {
    assertCommunityModuleFolderShape(moduleFolderPath, moduleName, { modulesRoot: modulesPath });
  } catch (err) {
    await handleModuleError(err, moduleName, motherEmitter, jwt);
    return false;
  }

  const indexJsPath = path.join(modulesPath, moduleName, 'index.js');
  if (!fs.existsSync(indexJsPath)) {
    notify({
      moduleName,
      notificationType: 'system',
      priority: 'error',
      message: `[MODULE LOADER] Missing index.js in '${moduleName}'. Module disabled.`
    });
    await deactivateModule(motherEmitter, jwt, moduleName, 'Missing index.js');
    removeListenersForModule(motherEmitter, moduleName);
    sharedModuleAccessConsentManager.rejectAllForModule(moduleName, 'Missing index.js');
    return false;
  }

  if (isAutoRetry) {
    console.log(`[MODULE LOADER] Auto-retry => "${moduleName}" gets another chance.`);
  }

  let loadFailed = false;
  let modEntry;
  let wasDeactivated = false;
  const deactivationListener = (payload) => {
    const target = payload && (payload.moduleName || payload.targetModuleName);
    if (target === moduleName) {
      wasDeactivated = true;
    }
  };
  motherEmitter.on('deactivateModule', deactivationListener);

  try {
    await runCommunityModuleHealthCheck({
      indexJsPath,
      jwt,
      moduleDir: path.dirname(indexJsPath),
      moduleInfo,
      moduleName,
      motherEmitter,
      nonce,
      accessGrants
    });

    modEntry = await startCommunityModuleProcess({
      app,
      indexJsPath,
      jwt,
      moduleDir: path.dirname(indexJsPath),
      moduleInfo,
      moduleName,
      motherEmitter,
      nonce,
      phase: 'runtime',
      accessGrants,
      accessConsentManager: sharedModuleAccessConsentManager
    });
  } catch (err) {
    loadFailed = true;
    await handleModuleError(err, moduleName, motherEmitter, jwt, modEntry);
  }

  if (loadFailed) {
    motherEmitter.off('deactivateModule', deactivationListener);
    return false;
  }

    // Successful load => clear last_error
  await updateModuleLastError(motherEmitter, jwt, moduleName, null);

    // If auto-retry => reactivate module
  if (isAutoRetry) {
    console.log(`[MODULE LOADER] Auto-retry => reactivating "${moduleName}".`);
    await new Promise((resolve, reject) => {
      motherEmitter.emit(
        'activateModuleInRegistry',
        {
          jwt,
          moduleName: 'moduleLoader',
          moduleType: 'core',
          targetModuleName: moduleName
        },
        (err2) => {
          if (err2) {
            notify({
              moduleName,
              notificationType: 'system',
              priority: 'error',
              message: `[MODULE LOADER] Failed to activate "${moduleName}": ${err2.message}`
            });
            return reject(err2);
          }
          resolve();
        }
      );
    });
  }
  const deactivateAndReturn = () => {
    motherEmitter.off('deactivateModule', deactivationListener);
    return false;
  };

  if (wasDeactivated) {
    console.warn(`[MODULE LOADER] Module "${moduleName}" deactivated during load.`);
    return deactivateAndReturn();
  }

  motherEmitter.off('deactivateModule', deactivationListener);
  global.loadedModules[moduleName] = modEntry.getRuntimeRecord();
  console.log(`[MODULE LOADER] Successfully loaded => ${moduleName}`);
  return true;

  async function handleModuleError(err, moduleName, motherEmitter, jwt, runtime = null) {
    const errorMsg = `[E_MODULE_LOAD_FAILED] Error loading "${moduleName}": ${err.message}`;
    notify({
      moduleName,
      notificationType: 'system',
      priority: 'error',
      message: `[MODULE LOADER] ${moduleName} could not be loaded: ${err.message}`
    });

    // Deactivate in the database
    await deactivateModule(motherEmitter, jwt, moduleName, errorMsg);

    // Clean up emitter listeners
    removeListenersForModule(motherEmitter, moduleName);
    sharedModuleAccessConsentManager.rejectAllForModule(moduleName, errorMsg);
    runtime?.stop?.(errorMsg);
    if (global.loadedModules?.[moduleName]?.stop) {
      global.loadedModules[moduleName].stop(errorMsg);
    }
    if (global.loadedModules) delete global.loadedModules[moduleName];
  }
}

module.exports = {
  loadAllModules,
  MODULE_NAME,
  MODULE_TYPE,
  _internals: {
    RESERVED_CORE_MODULES,
    assertCommunityModuleFolderShape,
    attemptModuleLoad,
    buildModuleRuntimeEnv,
    normalizeServiceName,
    readCommunityModuleInfo,
    readModuleApiDefinition,
    runCommunityModuleHealthCheck,
    serveStaticFrontend,
    serviceNamesFromApiDefinition,
    startCommunityModuleProcess
  }
};
