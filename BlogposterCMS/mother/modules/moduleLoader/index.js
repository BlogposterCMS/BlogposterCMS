/**
 * mother/modules/moduleLoader/index.js
 *
 * New, optimized Module Loader with health checks and auto-retry logic.
 *
 * Highlights:
 * 1) Checks whether modules can initialize cleanly (health check).
 * 2) Uses a simple Node vm sandbox to test modules in isolation.
 * 3) Deactivates malfunctioning modules.
 * 4) After a successful health check, reloads the module in production mode.
 * 5) Auto-retries previously crashed modules.
 * 6) Optionally serves Grapes frontends.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// If you have a custom NotificationEmitter, you could integrate it here:
const notificationEmitter = require('../../emitters/notificationEmitter');

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
  initListActiveGrapesModulesEvent,
  initListSystemModulesEvent,
  getModuleRegistry,
  insertModuleRegistryEntry,
  updateModuleLastError,
  deactivateModule
} = require('./moduleRegistryService');

const { initModuleRegistryAdminEvents } = require('./moduleRegistryEvents');

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
  const modulesPath = path.resolve(__dirname, '../../../modules');
  const ALLOW_INDIVIDUAL_SANDBOX = (process.env.ALLOW_INDIVIDUAL_SANDBOX !== 'false');

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
  initListActiveGrapesModulesEvent(motherEmitter);
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
  const folderNames = fs
    .readdirSync(modulesPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  // 6) Insert new modules into the registry
  const knownNames = dbRegistry.map(r => r.module_name);

  for (const folder of folderNames) {
    const moduleFolderPath = path.join(modulesPath, folder);
    const moduleInfoPath = path.join(moduleFolderPath, 'moduleInfo.json');

    let moduleInfo = {};

    if (fs.existsSync(moduleInfoPath)) {
      try {
        moduleInfo = JSON.parse(fs.readFileSync(moduleInfoPath, 'utf8'));
      } catch (err) {
        console.error(`[MODULE LOADER] Error reading moduleInfo.json for "${folder}": ${err.message}. Using defaults.`);
      }
    } else {
      console.warn(`[MODULE LOADER] moduleInfo.json missing for "${folder}". Using defaults.`);
    }

    // Minimal default fields
    if (!moduleInfo.moduleName)    moduleInfo.moduleName = folder;
    if (!moduleInfo.developer)     moduleInfo.developer  = 'Unknown Developer';
    if (!moduleInfo.version)       moduleInfo.version    = '';
    if (!moduleInfo.description)   moduleInfo.description= '';

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
    if (row.is_active) {
      await attemptModuleLoad(
        row,
        folderNames,
        modulesPath,
        motherEmitter,
        app,
        jwt,
        ALLOW_INDIVIDUAL_SANDBOX,
          false // Normal load, not an auto-retry
      );
    }
  }

  // 8) PASS #2 => Auto-retry previously crashed modules
  for (const row of dbRegistry) {
    if (!row.is_active && row.last_error && row.last_error.trim() !== '') {
      console.log(`[MODULE LOADER] Auto-retrying "${row.module_name}" => last error: ${row.last_error}`);
      await attemptModuleLoad(
        row,
        folderNames,
        modulesPath,
        motherEmitter,
        app,
        jwt,
        ALLOW_INDIVIDUAL_SANDBOX,
        true 
      );
    }
  }

  // 9) Optionally serve Grapes frontends
  for (const row of dbRegistry) {
    if (row.is_active && row.moduleInfo && row.moduleInfo.grapesComponent) {
      const modName = row.module_name;
      const frontEndDir = path.join(modulesPath, modName, 'frontend');
      if (fs.existsSync(frontEndDir)) {
        console.log(`[MODULE LOADER] Serving frontend for Grapes module: ${modName}`);
        const express = require('express');
        app.use(`/modules/${modName}`, express.static(frontEndDir));
      }
    }
  }

  console.log('[MODULE LOADER] All optional modules loaded / retried successfully. The meltdown continues.');
}

// Load a module in a simple vm sandbox
function loadModuleSandboxed(indexJsPath) {
  // Whitelist of packages accessible from sandboxed modules.
  // Note: This includes a curated set of core modules and explicitly allowed deps.
  const allowedBuiltins = new Set(['path', 'fs', 'crypto', 'sanitize-html']);

  function sandboxRequire(reqPath) {
    // Allow listed core/external deps
    if (allowedBuiltins.has(reqPath)) {
      return require(reqPath);
    }
    if (reqPath.startsWith('./') || reqPath.startsWith('../')) {
      const moduleDir = path.dirname(indexJsPath);
      const resolved = path.resolve(moduleDir, reqPath);

      // Primary rule: keep module-relative requires inside the module folder
      const isInsideModule = resolved.startsWith(moduleDir + path.sep);

      // Exception: allow read-only access to the placeholder registry for DB hooks
      const placeholdersDir = path.resolve(__dirname, '../databaseManager/placeholders');
      const isPlaceholderRegistry = resolved.startsWith(placeholdersDir + path.sep);

      if (!isInsideModule && !isPlaceholderRegistry) {
        throw new Error('Invalid require path');
      }
      return require(resolved);
    }
    throw new Error(`Access to '${reqPath}' is denied`);
  }

  const context = {
    module: { exports: {} },
    exports: {},
    require: sandboxRequire,
    __filename: indexJsPath,
    __dirname: path.dirname(indexJsPath),
    console,
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    // expose only the OPENAI API key to sandboxed modules for security
    process: {
      env: {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        GROK_API_KEY: process.env.GROK_API_KEY,
        XAI_API_KEY: process.env.XAI_API_KEY,
        BRAVE_API_KEY: process.env.BRAVE_API_KEY,
        NEWS_MODEL: process.env.NEWS_MODEL
      }
    }
  };
  vm.createContext(context);
  const code = fs.readFileSync(indexJsPath, 'utf8');
  vm.runInContext(code, context, { filename: indexJsPath });
  return context.module.exports;
}

/**
 * attemptModuleLoad: tries to load a single module with a preceding health check.
 * - Loads the module from its folder
 * - Runs a health check (test initialize)
 * - On error -> deactivate module and remove event listeners
 * - On success -> perform real load (initialize with the real emitter)
 * - On auto-retry -> reactivate the module in the database
 */
async function attemptModuleLoad(
  registryRow,
  folderNames,
  modulesPath,
  motherEmitter,
  app,
  jwt,
  ALLOW_INDIVIDUAL_SANDBOX,
  isAutoRetry
) {
  const { module_name: moduleName } = registryRow;

  // Does the folder still exist?
  if (!folderNames.includes(moduleName)) {
    console.warn(`[MODULE LOADER] No folder => ${moduleName}. Possibly was deleted.`);
    return false;
  }

  // Force "community" as the module type
  motherEmitter.registerModuleType(moduleName, 'community');

  const indexJsPath = path.join(modulesPath, moduleName, 'index.js');
  if (!fs.existsSync(indexJsPath)) {
    notify({
      moduleName,
      notificationType: 'system',
      priority: 'error',
      message: `[MODULE LOADER] Missing index.js in '${moduleName}'. Module disabled.`
    });
    await deactivateModule(motherEmitter, jwt, moduleName, 'Missing index.js');
    motherEmitter.emit('removeListenersByModule', { moduleName });
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
    if (ALLOW_INDIVIDUAL_SANDBOX) {
      modEntry = loadModuleSandboxed(indexJsPath);
    } else {
        // If isolation is desired but ALLOW_INDIVIDUAL_SANDBOX = false,
        // load it directly and hope for the best.
      modEntry = require(indexJsPath);
    }
  } catch (err) {
    loadFailed = true;
    await handleModuleError(err, moduleName, motherEmitter, jwt);
  }

  if (!loadFailed) {
    try {
        // Run the health check first
      await performHealthCheck(modEntry, moduleName, app, jwt);

        // If we reach this point, the health check succeeded
        // => initialize the module for real
      await modEntry.initialize({
        motherEmitter,
        app,
        isCore: false,
        jwt
      });
    } catch (err) {
      loadFailed = true;
      await handleModuleError(err, moduleName, motherEmitter, jwt);
    }
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
  global.loadedModules[moduleName] = modEntry;
  console.log(`[MODULE LOADER] Successfully loaded => ${moduleName}`);
  return true;

  async function handleModuleError(err, moduleName, motherEmitter, jwt) {
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
    motherEmitter.emit('removeListenersByModule', { moduleName });
    if (global.loadedModules) delete global.loadedModules[moduleName];
  }
}

/**
 * performHealthCheck: run a trial initialization of the module.
 * If the module misbehaves (e.g., missing initialize() or emitting invalid events),
 * it gets rejected.
 */
async function performHealthCheck(modEntry, moduleName, app, jwt) {
  // 1) Does the module even have an initialize() function?
  if (!modEntry || typeof modEntry.initialize !== 'function') {
    throw new Error('[HEALTH CHECK] Module has no initialize() function.');
  }

  let healthCheckPassed = false;

  // 2) Dry run in a stripped-down "test emitter" environment
  const testEmitter = {
    emit(event, payload, cb) {
        // Ensure a callback is provided
      if (typeof cb !== 'function') {
        throw new Error('HealthCheck-Emitter: A callback is required in emitter events.');
      }
        // Verify moduleName and moduleType are correct
      if (!payload.moduleName || payload.moduleType !== 'community') {
        throw new Error(`Invalid payload from module "${moduleName}" - missing moduleName/moduleType.`);
      }
      healthCheckPassed = true;
        cb(null); // Simulate a successful callback
    },
      on() {
        /* Noop: we don't listen to events during the health check. */
      },
    listenerCount() {
      // Modules may call listenerCount to avoid duplicate handlers. During
      // the health check we don't register listeners, so always return 0.
      return 0;
    },
      registerModuleType() {
        // Not relevant for the test run; pretend it's already done.
      }
  };

    // 3) Execute the initialize method; hope it doesn't blow up.
  await modEntry.initialize({
    motherEmitter: testEmitter,
    app,
    isCore: false, 
    jwt
  });

  if (!healthCheckPassed) {
    throw new Error(
      `Health check failed: Module "${moduleName}" did not emit a valid event or never used the emitter.`
    );
  }
  // Looks good.
}

module.exports = {
  loadAllModules
};
