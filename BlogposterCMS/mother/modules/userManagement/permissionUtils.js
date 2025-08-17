/**
 * mother/modules/userManagement/permissionUtils.js
 *
 * Provides:
 *   - mergeAllPermissions(rolesArr)
 *   - deepMerge utility
 *
 * For handling the role permissions merging logic.
 */

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
  console.log('[USER MGMT] mergeAllPermissions => Starting to merge. rolesArr:', rolesArr);

  const merged = {};
  if (!rolesArr || !rolesArr.length) {
    console.warn('[USER MGMT] mergeAllPermissions => No roles provided => meltdown meltdown but we continue.');
    return doneCallback(merged);
  }

  const invalidRoles = [];
  for (const role of rolesArr) {
    console.log(`[USER MGMT] mergeAllPermissions => Processing role with id: ${role.id}`);
    try {
      let perms;
      if (typeof role.permissions === 'string') {
        perms = JSON.parse(role.permissions || '{}');
      } else {
        perms = role.permissions || {};
      }
      deepMerge(merged, perms);
    } catch (ex) {
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
    console.log('[USER MGMT] mergeAllPermissions => No invalid roles, returning merged perms:', merged);
    return doneCallback(merged);
  }

  // fix invalid roles in DB without raw SQL
  console.warn('[USER MGMT] mergeAllPermissions => Attempting to fix invalid perms in DB =>', invalidRoles);

  const updates = invalidRoles.map(r => new Promise((resolve) => {
    motherEmitter.emit('dbUpdate', {
      jwt,
      moduleName: 'userManagement',
      table: 'roles',
      where: { id: r.id },
      data: {
        permissions: JSON.stringify(r.perms),
        updated_at: new Date().toISOString()
      }
    }, (err) => {
      if (err) {
        console.error('[USER MGMT] mergeAllPermissions => Could not fix role', r.id, err.message);
      }
      resolve();
    });
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
