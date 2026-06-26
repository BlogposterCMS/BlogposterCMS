/**
 * mother/modules/moduleLoader/moduleUninstaller.js
 *
 * 1) Deactivate or remove from registry
 * 2) Optionally remove the DB
 * 3) Remove the folder from /modules
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  updateModuleLastError,
  deactivateModule
} = require('./moduleRegistryService');
const {
  deactivateModuleRuntime,
  removeListenersForModule
} = require('../../emitters/motherEmitter');
const { assertUserManagedModuleName } = require('./moduleOwnershipPolicy');

function assertInside(baseDir, candidatePath, label = 'path') {
  const root = path.resolve(baseDir);
  const resolved = path.resolve(candidatePath);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  const compareRoot = process.platform === 'win32' ? root.toLowerCase() : root;
  const compareResolved = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const compareRootPrefix = process.platform === 'win32' ? rootPrefix.toLowerCase() : rootPrefix;
  if (compareResolved !== compareRoot && !compareResolved.startsWith(compareRootPrefix)) {
    throw new Error(`[UNINSTALL MODULE] ${label} escapes modules root.`);
  }
  return resolved;
}

function cleanupModuleRuntime(motherEmitter, moduleName, reason = 'User uninstalled module') {
  if (global.loadedModules) delete global.loadedModules[moduleName];
  deactivateModuleRuntime(motherEmitter, moduleName, reason);
  removeListenersForModule(motherEmitter, moduleName);
}

async function uninstallModule(motherEmitter, jwt, moduleName, options = {}) {
  const safeModuleName = assertUserManagedModuleName(moduleName, 'uninstalled');
  try {
    cleanupModuleRuntime(motherEmitter, safeModuleName, 'User uninstalled module');

    // 1) remove or deactivate from registry
    if (options.removeRegistryRow) {
      await new Promise((resolveDelete, rejectDelete) => {
        motherEmitter.emit(
          'dbDelete',
          {
            jwt,
            moduleName: 'moduleLoader',
            moduleType: 'core',
            table: 'module_registry',
            where: { module_name: safeModuleName }
          },
          (err) => {
            if (err) {
              console.error('[UNINSTALL MODULE] DB error:', err.message);
              return rejectDelete(err);
            }
            resolveDelete();
          }
        );
      });
    } else {
      // meltdown => standard approach => set is_active=false
      await deactivateModule(motherEmitter, jwt, safeModuleName, 'User uninstalled module');
    }

    // 2) drop module database if requested
    if (options.removeDatabase) {
      const dbModuleName = safeModuleName.toLowerCase();
      await new Promise((resolvePlaceholder, rejectPlaceholder) => {
        motherEmitter.emit(
          'dbUpdate',
          {
            jwt,
            moduleName: 'moduleLoader',
            moduleType: 'core',
            table: '__rawSQL__',
            data: {
              rawSQL: 'DROP_MODULE_DATABASE',
              params: [dbModuleName]
            }
          },
          (err) => {
            if (err) {
              console.error('[UNINSTALL MODULE] Error dropping database/schema:', err.message);
              return rejectPlaceholder(err);
            }
            resolvePlaceholder();
          }
        );
      });
    }

    // 3) remove folder from /modules
    const modulesRoot = path.resolve(options.modulesRoot || path.resolve(__dirname, '../../../modules'));
    const moduleFolder = assertInside(modulesRoot, path.join(modulesRoot, safeModuleName), 'module folder');
    if (fs.existsSync(moduleFolder)) {
      fs.rmSync(moduleFolder, { recursive: true, force: true });
    }

    return { success: true, moduleName: safeModuleName };
  } catch (err) {
    console.error('[UNINSTALL MODULE] meltdown meltdown =>', err.message);
    await updateModuleLastError(motherEmitter, jwt, safeModuleName, err.message).catch(() => {});
    throw err;
  }
}

module.exports = {
  uninstallModule,
  _internals: {
    assertInside,
    cleanupModuleRuntime
  }
};
