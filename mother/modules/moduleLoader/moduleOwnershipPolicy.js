'use strict';

const { sanitizeModuleName } = require('../../utils/moduleUtils');

const CORE_OWNED_MODULE_NAMES = new Set([
  'designer'
]);

function isCoreOwnedModule(moduleName = '') {
  return CORE_OWNED_MODULE_NAMES.has(String(moduleName || '').trim());
}

function assertUserManagedModuleName(moduleName = '', action = 'managed') {
  const safeModuleName = sanitizeModuleName(moduleName);
  if (isCoreOwnedModule(safeModuleName)) {
    throw new Error(`[MODULE LOADER] Core-owned module "${safeModuleName}" cannot be ${action} through module management APIs.`);
  }
  return safeModuleName;
}

module.exports = {
  CORE_OWNED_MODULE_NAMES,
  assertUserManagedModuleName,
  isCoreOwnedModule
};
