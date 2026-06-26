// mother/modules/dependencyLoader/index.js
require('dotenv').config();
const { builtinModules } = require('module');
const {
  ensureDependencyLoaderDatabase,
  ensureDependencyLoaderSchemaAndTable,
  loadDependencies,
  checkAndLoadDependency
} = require('./dependencyLoaderService');

// Import onceCallback from motherEmitter
const { onceCallback } = require('../../emitters/motherEmitter');

const BUILTIN_MODULES = new Set([
  ...builtinModules,
  ...builtinModules.map(name => `node:${name}`)
]);
const VALID_MODULE_NAME = /^[A-Za-z0-9_-]+$/;
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
const MODULE_NAME = 'dependencyLoader';
const MODULE_TYPE = 'core';

function getRegisteredModuleType(motherEmitter, moduleName) {
  if (!motherEmitter || !motherEmitter._moduleTypes || !moduleName) {
    return null;
  }
  return motherEmitter._moduleTypes[moduleName] || null;
}

function isSafeDependencyName(dependencyName) {
  const name = String(dependencyName || '').trim();
  if (!PACKAGE_NAME_PATTERN.test(name)) {
    return false;
  }
  if (name.includes('/') && !name.startsWith('@')) {
    return false;
  }
  return !BUILTIN_MODULES.has(name);
}

function isSafeModuleName(moduleName) {
  return VALID_MODULE_NAME.test(String(moduleName || '').trim());
}

function assertDependencyRequestAllowed(motherEmitter, payload = {}) {
  const {
    moduleName,
    moduleNameToCheck,
    moduleType,
    dependencyName
  } = payload;
  const registeredType = getRegisteredModuleType(motherEmitter, moduleName);

  if (!isSafeModuleName(moduleName)) {
    throw new Error('Dependency requester moduleName is invalid.');
  }

  if (!isSafeModuleName(moduleNameToCheck)) {
    throw new Error('Dependency target moduleNameToCheck is invalid.');
  }

  if (!isSafeDependencyName(dependencyName)) {
    throw new Error(`Dependency "${dependencyName}" is not a safe package name.`);
  }

  if (!registeredType) {
    throw new Error(`Dependency requester "${moduleName}" is not registered.`);
  }

  if (moduleType && moduleType !== registeredType) {
    throw new Error(`Registered module "${moduleName}" cannot request dependencies as moduleType="${moduleType}".`);
  }

  if (registeredType === 'community') {
    if (moduleName !== moduleNameToCheck) {
      throw new Error(`Community module "${moduleName}" can only request dependencies for itself.`);
    }
  }
}

/**
 * The dependency loader main file:
 *   1) Ensures "dependencyloader_db"
 *   2) Ensures schema + table "dependencyloader".module_dependencies
 *   3) Loads all allowed dependencies
 *   4) meltdown => "requestDependency"
 */
module.exports = {
  async initialize({ motherEmitter, isCore, jwt, jwtToken }) {
    console.log('[DEPENDENCY LOADER] Initializing dependency loader... because apparently we need it.');

    if (!isCore) {
      throw new Error('[DEPENDENCY LOADER] Must be loaded as a core module.');
    }
    const moduleJwt = jwtToken || jwt;
    if (!moduleJwt) {
      throw new Error('[DEPENDENCY LOADER] initialization requires a valid JWT token.');
    }
    if (!motherEmitter) {
      throw new Error('[DEPENDENCY LOADER] motherEmitter missing.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    try {
      // 1) ensure DB => "dependencyloader_db"
      await ensureDependencyLoaderDatabase(motherEmitter, moduleJwt);

      // 2) ensure schema + table => "dependencyloader".module_dependencies
      await ensureDependencyLoaderSchemaAndTable(motherEmitter, moduleJwt);

      // 3) load the dependencies from that table into global cache
      await loadDependencies(motherEmitter, moduleJwt);

      // 4) meltdown => "requestDependency"
      motherEmitter.on('requestDependency', (payload, originalCb) => {
        // We love not double-calling the same callback => onceCallback:
        const callback = onceCallback(originalCb);

        (async () => {
          try {
            const { moduleNameToCheck, dependencyName } = payload || {};
            if (!moduleNameToCheck || !dependencyName) {
              throw new Error('moduleNameToCheck and dependencyName are required');
            }
            assertDependencyRequestAllowed(motherEmitter, payload);

            const allowed = await checkAndLoadDependency(motherEmitter, moduleNameToCheck, dependencyName);
            if (!allowed) {
              throw new Error(`Dependency "${dependencyName}" is not allowed for module "${moduleNameToCheck}"`);
            }
            // If allowed => require it
            const dep = require(dependencyName);
            callback(null, dep);
          } catch (err) {
            callback(err);
          }
        })();
      });

      console.log('[DEPENDENCY LOADER] Dependency loader is ready. Let the meltdown commence.');
    } catch (error) {
      console.error('[DEPENDENCY LOADER] Fatal error =>', error.message);
      // rethrow or handle as needed
      throw error;
    }
  },
  _internals: {
    assertDependencyRequestAllowed,
    getRegisteredModuleType,
    isSafeModuleName,
    isSafeDependencyName
  },
  MODULE_NAME,
  MODULE_TYPE
};
