

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

/**
 * mother/modules/userManagement/permissionUtils.js
 *
 * Provides:
 *   - mergeAllPermissions(rolesArr)
 *   - deepMerge utility
 *
 * For handling the role permissions merging logic.
 */
const { requestBackendEvent } = require('../../contracts/backendEventContracts');
const { traceRuntimeEvent } = require('../../utils/runtimeLogging');

function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  for (const key of Object.keys(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue; // prevent prototype pollution
    }
    const value = source[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!Object.prototype.hasOwnProperty.call(target, key) || typeof target[key] !== 'object') {
        target[key] = {};
      }
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

/**
 * mergeAllPermissions:
 *   merges multiple roles' permissions into a single object.
 *   If invalid JSON found => fallback perms + attempts DB fix.
 */
function mergeAllPermissions(motherEmitter, jwt, rolesArr, doneCallback) {
  traceRuntimeEvent('[USER MGMT] mergeAllPermissions => role count:', rolesArr?.length || 0);

  const merged = {};
  if (!rolesArr || !rolesArr.length) {
    console.warn('[USER MGMT] mergeAllPermissions => No roles provided => meltdown meltdown but we continue.');
    return doneCallback(merged);
  }

  const invalidRoles = [];
  for (const role of rolesArr) {
    traceRuntimeEvent(`[USER MGMT] mergeAllPermissions => processing role id: ${role.id}`);
    try {
      let perms;
      if (typeof role.permissions === 'string') {
        perms = JSON.parse(role.permissions || '{}');
      } else {
        perms = role.permissions || {};
      }
      deepMerge(merged, perms);
    } catch {
      console.warn('[USER MGMT] mergeAllPermissions => Invalid JSON in role => fallback perms. Role:', role.id);
      const fallback = { read: true, write: true };
      deepMerge(merged, fallback);
      invalidRoles.push({
        id: role.id,
        perms: fallback
      });
    }
  }

  if (!invalidRoles.length) {
    traceRuntimeEvent('[USER MGMT] mergeAllPermissions => merged permissions:', merged);
    return doneCallback(merged);
  }

  // fix invalid roles in DB without raw SQL
  console.warn('[USER MGMT] mergeAllPermissions => Attempting to fix invalid perms in DB =>', invalidRoles);

  const updates = invalidRoles.map(r => requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
      jwt,
      moduleName: 'userManagement',
      table: 'roles',
      where: { id: r.id },
      data: {
        permissions: JSON.stringify(r.perms),
        updated_at: new Date().toISOString()
      }
    }).catch(err => {
      console.error('[USER MGMT] mergeAllPermissions => Could not fix role', r.id, err.message);
    }));

  Promise.all(updates).finally(() => {
    doneCallback(merged); // proceed either way
  });
}

/**
 * hasPermission:
 *   Checks if a decoded JWT contains the given permission path.
 *   Supports wildcard (*) at any level and dot notation paths.
 */
function hasPermission(decodedJWT, keyPath) {
  try {
    if (!decodedJWT || !decodedJWT.permissions) return false;
    const perms = decodedJWT.permissions;
    if (perms['*'] === true) return true;

    const parts = keyPath.split('.');
    let current = perms;
    for (const part of parts) {
      if (current['*'] === true) return true;
      if (typeof current[part] === 'undefined') return false;
      current = current[part];
    }
    return current === true;
  } catch {
    return false;
  }
}

module.exports = {
  mergeAllPermissions,
  deepMerge,
  hasPermission
};
