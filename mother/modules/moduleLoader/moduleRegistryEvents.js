/**
 * mother/modules/moduleLoader/moduleRegistryEvents.js
 *
 * meltdown events for admin actions on the module registry:
 *   1) 'activateModuleInRegistry'
 *   2) 'deactivateModuleInRegistry'
 *
 * Also includes attemptSingleLoad to require & initialize the module immediately (one-off).
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
  deactivateModuleRuntime,
  onceCallback,
  removeListenersForModule
} = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');
const {
  updateModuleLastError,
  deactivateModule
} = require('./moduleRegistryService');
const { sanitizeModuleName } = require('../../utils/moduleUtils');
const {
  createCommunityModuleHost,
  createDeniedAppFacade
} = require('./moduleHost');
const {
  assertCommunityModuleFolderShape,
  readCommunityModuleInfo
} = require('./moduleFolderPolicy');
const { assertUserManagedModuleName } = require('./moduleOwnershipPolicy');
const { loadModuleSandboxed } = require('./moduleSandbox');

function assertInside(baseDir, candidatePath, label = 'path') {
  const root = path.resolve(baseDir);
  const resolved = path.resolve(candidatePath);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  const compareRoot = process.platform === 'win32' ? root.toLowerCase() : root;
  const compareResolved = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const compareRootPrefix = process.platform === 'win32' ? rootPrefix.toLowerCase() : rootPrefix;
  if (compareResolved !== compareRoot && !compareResolved.startsWith(compareRootPrefix)) {
    throw new Error(`[REGISTRY EVENTS] ${label} escapes module root.`);
  }
  return resolved;
}

function readModuleInfo(modulePath, moduleName) {
  return readCommunityModuleInfo(modulePath, moduleName, { modulesRoot: path.dirname(modulePath) });
}

function cleanupModuleRuntime(motherEmitter, moduleName, reason = 'Module deactivated') {
  const safeModuleName = sanitizeModuleName(moduleName);
  if (global.loadedModules) delete global.loadedModules[safeModuleName];
  deactivateModuleRuntime(motherEmitter, safeModuleName, reason);
  removeListenersForModule(motherEmitter, safeModuleName);
}

function initModuleRegistryAdminEvents(motherEmitter, app) {
  // meltdown => 'activateModuleInRegistry'
  motherEmitter.on('activateModuleInRegistry', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    try {
      const { jwt, moduleName, moduleType, targetModuleName } = payload;
      if (!jwt || moduleName !== 'moduleLoader' || moduleType !== 'core') {
        return callback(new Error('[REGISTRY EVENTS] meltdown => must come from moduleLoader/core.'));
      }

      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'modules.activate')) {
        return callback(new Error('Forbidden – missing permission: modules.activate'));
      }

      const safeTargetModuleName = assertUserManagedModuleName(targetModuleName, 'activated');

      // meltdown => dbUpdate => set is_active=TRUE
      motherEmitter.emit(
        'dbUpdate',
        {
          jwt,
          moduleName: 'moduleLoader',
          moduleType: 'core',
          table: 'module_registry',
          where: { module_name: safeTargetModuleName },
          data: {
            is_active: true,
            last_error: null,
            updated_at: new Date().toISOString()
          }
        },
        async (err) => {
          if (err) return callback(err);

          console.log(`[REGISTRY EVENTS] Attempting immediate load => ${safeTargetModuleName}`);
          const success = await attemptSingleLoad(safeTargetModuleName, motherEmitter, app, jwt);
          if (!success) {
            return callback(new Error('Module load failed again. We tried.'));
          }
          callback(null);
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // meltdown => 'deactivateModuleInRegistry'
  motherEmitter.on('deactivateModuleInRegistry', (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    try {
      const { jwt, moduleName, moduleType, targetModuleName } = payload;
      if (!jwt || moduleName !== 'moduleLoader' || moduleType !== 'core') {
        return callback(new Error('[REGISTRY EVENTS] meltdown => must come from moduleLoader/core.'));
      }

      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'modules.deactivate')) {
        return callback(new Error('Forbidden – missing permission: modules.deactivate'));
      }

      const safeTargetModuleName = assertUserManagedModuleName(targetModuleName, 'deactivated');

      // meltdown => dbUpdate => is_active=FALSE
      motherEmitter.emit(
        'dbUpdate',
        {
          jwt,
          moduleName: 'moduleLoader',
          moduleType: 'core',
          table: 'module_registry',
          where: { module_name: safeTargetModuleName },
          data: {
            is_active: false,
            updated_at: new Date().toISOString()
          }
        },
        (err) => {
          if (err) return callback(err);
          cleanupModuleRuntime(motherEmitter, safeTargetModuleName, 'Module deactivated via registry.');
          console.log(`[REGISTRY EVENTS] Deactivated module => ${safeTargetModuleName}`);
          callback(null, { moduleName: safeTargetModuleName, deactivated: true });
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // meltdown => 'installModuleFromZip'
  motherEmitter.on('installModuleFromZip', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    try {
      const { jwt, moduleName, moduleType, zipData } = payload || {};
      if (!jwt || moduleName !== 'moduleLoader' || moduleType !== 'core') {
        return callback(new Error('[REGISTRY EVENTS] installModuleFromZip => invalid meltdown payload.'));
      }

      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'modules.install')) {
        return callback(new Error('Forbidden – missing permission: modules.install'));
      }

      if (!zipData) {
        return callback(new Error('No zipData provided.'));
      }

      const buffer = Buffer.isBuffer(zipData) ? zipData : Buffer.from(zipData, 'base64');

      const { installModuleFromZip } = require('./moduleInstallerService');
      const result = await installModuleFromZip(motherEmitter, jwt, buffer, { notifyAdmin: true });
      callback(null, result);
    } catch (ex) {
      callback(ex);
    }
  });
}

async function attemptSingleLoad(moduleName, motherEmitter, app, jwt, options = {}) {
  // attempt to require & initialize the module
  try {
    moduleName = sanitizeModuleName(moduleName);
    const modulesDir = path.resolve(options.modulesRoot || path.resolve(__dirname, '../../../modules'));
    const modulePath = assertInside(modulesDir, path.join(modulesDir, moduleName), 'module path');
    const indexJs = assertInside(modulePath, path.join(modulePath, 'index.js'), 'module entry');
    assertCommunityModuleFolderShape(modulePath, moduleName, { modulesRoot: modulesDir });

    if (!fs.existsSync(indexJs)) {
      console.warn(`[REGISTRY EVENTS] No index.js => ${moduleName}`);
      await deactivateModule(motherEmitter, jwt, moduleName, 'Missing index.js');
      cleanupModuleRuntime(motherEmitter, moduleName, 'Missing index.js');
      return false;
    }

    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(moduleName, 'community');
    }

    const moduleInfo = readModuleInfo(modulePath, moduleName);
    const nonce = crypto.randomBytes(16).toString('hex');
    if (process.env.ALLOW_COMMUNITY_APP_ACCESS === 'true') {
      console.warn('[REGISTRY EVENTS] Ignoring ALLOW_COMMUNITY_APP_ACCESS=true; community modules never receive the raw Express app.');
    }
    const modEntry = loadModuleSandboxed(indexJs);
    if (!modEntry || typeof modEntry.initialize !== 'function') {
      throw new Error(`Module "${moduleName}" has no initialize() function.`);
    }

    const moduleHost = createCommunityModuleHost({
      app,
      motherEmitter,
      moduleName,
      moduleInfo,
      moduleDir: modulePath,
      jwt,
      nonce
    });

    await modEntry.initialize({
      motherEmitter: moduleHost.eventBus,
      eventBus: moduleHost.eventBus,
      moduleHost,
      app: createDeniedAppFacade(moduleName),
      isCore: false,
      moduleInfo
    });

    // set last_error=null on success
    await updateModuleLastError(motherEmitter, jwt, moduleName, null);
    global.loadedModules = global.loadedModules || {};
    global.loadedModules[moduleName] = modEntry;
    console.log(`[REGISTRY EVENTS] Activated & loaded => ${moduleName}`);
    return true;
  } catch (err) {
    console.error('[REGISTRY EVENTS] attemptSingleLoad => meltdown meltdown =>', err.message);
    await deactivateModule(motherEmitter, jwt, moduleName, err.message);
    cleanupModuleRuntime(motherEmitter, moduleName, err.message);
    return false;
  }
}

module.exports = {
  initModuleRegistryAdminEvents,
  _internals: {
    attemptSingleLoad,
    assertInside,
    cleanupModuleRuntime,
    readModuleInfo
  }
};
