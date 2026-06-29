'use strict';

const { getDbType } = require('../databaseManager/helpers/dbTypeHelpers');
const { parsePermissionBlob } = require('./userInitService');

const DIRECT_USER_ROLE_PREFIX = '__user_direct_';
const FORBIDDEN_DIRECT_PERMISSION_KEYS = new Set(['*', 'canAccessEverything']);

function emitAsync(motherEmitter, eventName, payload) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(eventName, payload, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function roleId(role) {
  return role?.id ?? role?._id;
}

function roleIdString(role) {
  const id = roleId(role);
  return id == null ? '' : String(id);
}

function directRoleNameForUser(userId) {
  return `${DIRECT_USER_ROLE_PREFIX}${String(userId)}`;
}

function isDirectUserRole(role = {}) {
  return String(role.role_name || '').startsWith(DIRECT_USER_ROLE_PREFIX);
}

function normalizeRoleIdList(roleIds) {
  const values = Array.isArray(roleIds) ? roleIds : [];
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function setPermissionPath(target, parts) {
  let cursor = target;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      cursor[part] = true;
      return;
    }
    if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) {
      cursor[part] = {};
    }
    cursor = cursor[part];
  });
}

function flattenPermissionBlob(blob, prefix = '') {
  const value = parsePermissionBlob(blob);
  const result = [];
  for (const [key, item] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (item === true) {
      result.push(nextKey);
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      result.push(...flattenPermissionBlob(item, nextKey));
    }
  }
  return result;
}

function permissionBlobFromKeys(keys) {
  const blob = {};
  for (const key of keys) {
    const parts = String(key || '').split('.').filter(Boolean);
    if (parts.length) setPermissionPath(blob, parts);
  }
  return blob;
}

function hasPermissionBlobEntries(blob) {
  return flattenPermissionBlob(blob).length > 0;
}

async function validateDirectPermissionBlob(motherEmitter, jwt, directPermissions = {}) {
  const keys = flattenPermissionBlob(directPermissions);
  if (!keys.length) return {};

  for (const key of keys) {
    if (FORBIDDEN_DIRECT_PERMISSION_KEYS.has(key)) {
      throw new Error(`[E_USER_ACCESS_FORBIDDEN_PERMISSION] Direct user permissions cannot include "${key}". Use a reviewed admin role instead.`);
    }
  }

  const rows = await emitAsync(motherEmitter, 'dbSelect', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    table: 'permissions'
  });
  const allowed = new Set((Array.isArray(rows) ? rows : []).map(row => String(row.permission_key || '')));
  const unknown = keys.filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new Error(`[E_USER_ACCESS_UNKNOWN_PERMISSION] Unknown permission key(s): ${unknown.join(', ')}`);
  }

  return permissionBlobFromKeys(keys.sort());
}

async function incrementUserTokenVersion(motherEmitter, jwt, userId) {
  const idField = getDbType() === 'mongodb' ? '_id' : 'id';
  await emitAsync(motherEmitter, 'dbUpdate', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    table: 'users',
    where: { [idField]: userId },
    data: {
      token_version: { '__raw_expr': 'token_version + 1' }
    }
  }).catch(async () => {
    const rows = await emitAsync(motherEmitter, 'dbSelect', {
      jwt,
      moduleName: 'userManagement',
      moduleType: 'core',
      table: 'users',
      where: { [idField]: userId }
    });
    const current = Number(rows?.[0]?.token_version || 0);
    await emitAsync(motherEmitter, 'dbUpdate', {
      jwt,
      moduleName: 'userManagement',
      moduleType: 'core',
      table: 'users',
      where: { [idField]: userId },
      data: { token_version: current + 1 }
    });
  });
}

async function findRoleByName(motherEmitter, jwt, roleName) {
  const rows = await emitAsync(motherEmitter, 'dbSelect', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    table: 'roles',
    where: { role_name: roleName }
  });
  return Array.isArray(rows) ? rows[0] : null;
}

async function ensureDirectRole(motherEmitter, jwt, userId, permissions) {
  const roleName = directRoleNameForUser(userId);
  const existingRole = await findRoleByName(motherEmitter, jwt, roleName);
  const data = {
    role_name: roleName,
    is_system_role: false,
    description: `Managed direct permissions for user ${userId}`,
    permissions: JSON.stringify(permissions),
    updated_at: new Date().toISOString()
  };

  if (existingRole) {
    await emitAsync(motherEmitter, 'dbUpdate', {
      jwt,
      moduleName: 'userManagement',
      moduleType: 'core',
      table: 'roles',
      where: { id: roleId(existingRole) },
      data
    });
    return { ...existingRole, ...data };
  }

  const inserted = await emitAsync(motherEmitter, 'dbInsert', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    table: 'roles',
    data: {
      ...data,
      created_at: new Date().toISOString()
    }
  });
  const insertedRole = Array.isArray(inserted) ? inserted[0] : inserted;
  return insertedRole && roleId(insertedRole)
    ? insertedRole
    : await findRoleByName(motherEmitter, jwt, roleName);
}

async function removeDirectRole(motherEmitter, jwt, userId) {
  const roleName = directRoleNameForUser(userId);
  const role = await findRoleByName(motherEmitter, jwt, roleName);
  if (!role) return;

  await emitAsync(motherEmitter, 'dbDelete', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    table: 'user_roles',
    where: { role_id: roleId(role) }
  });
  await emitAsync(motherEmitter, 'dbDelete', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    table: 'roles',
    where: { id: roleId(role) }
  });
}

async function readAllRoles(motherEmitter, jwt) {
  const roles = await emitAsync(motherEmitter, 'dbSelect', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    table: 'roles'
  });
  return Array.isArray(roles) ? roles : [];
}

async function assignRolesToUser(motherEmitter, jwt, userId, roleIds) {
  for (const roleIdValue of roleIds) {
    await emitAsync(motherEmitter, 'dbInsert', {
      jwt,
      moduleName: 'userManagement',
      moduleType: 'core',
      table: 'user_roles',
      data: {
        user_id: userId,
        role_id: roleIdValue,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    }).catch(err => {
      if (!/duplicate|unique/i.test(String(err?.message || err))) throw err;
    });
  }
}

async function setUserAccess(motherEmitter, jwt, userId, roleIds = [], directPermissions = {}) {
  const allRoles = await readAllRoles(motherEmitter, jwt);
  const directRoleNames = new Set(allRoles.filter(isDirectUserRole).map(role => String(role.role_name || '')));
  const roleById = new Map(allRoles.map(role => [roleIdString(role), role]));
  const selectedRoleIds = normalizeRoleIdList(roleIds);

  const invalidRoleIds = selectedRoleIds.filter(id => {
    const role = roleById.get(id);
    return !role || directRoleNames.has(String(role.role_name || ''));
  });
  if (invalidRoleIds.length) {
    throw new Error(`[E_USER_ACCESS_INVALID_ROLE] Unknown or managed role id(s): ${invalidRoleIds.join(', ')}`);
  }

  const normalizedDirectPermissions = await validateDirectPermissionBlob(motherEmitter, jwt, directPermissions);

  await emitAsync(motherEmitter, 'dbDelete', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    table: 'user_roles',
    where: { user_id: userId }
  });

  await assignRolesToUser(motherEmitter, jwt, userId, selectedRoleIds);

  if (hasPermissionBlobEntries(normalizedDirectPermissions)) {
    const directRole = await ensureDirectRole(motherEmitter, jwt, userId, normalizedDirectPermissions);
    await assignRolesToUser(motherEmitter, jwt, userId, [roleId(directRole)]);
  } else {
    await removeDirectRole(motherEmitter, jwt, userId);
  }

  await incrementUserTokenVersion(motherEmitter, jwt, userId);
  return {
    success: true,
    roleIds: selectedRoleIds,
    directPermissions: normalizedDirectPermissions
  };
}

async function getUserAccess(motherEmitter, jwt, userId) {
  const [allRoles, userRoles] = await Promise.all([
    readAllRoles(motherEmitter, jwt),
    emitAsync(motherEmitter, 'dbSelect', {
      jwt,
      moduleName: 'userManagement',
      moduleType: 'core',
      table: 'user_roles',
      where: { user_id: userId }
    })
  ]);
  const assignedIds = new Set((Array.isArray(userRoles) ? userRoles : []).map(row => String(row.role_id)));
  const assignedRoles = allRoles.filter(role => assignedIds.has(roleIdString(role)));
  const directRole = assignedRoles.find(isDirectUserRole);
  const visibleRoles = assignedRoles.filter(role => !isDirectUserRole(role));

  return {
    roles: visibleRoles,
    roleIds: visibleRoles.map(roleIdString).filter(Boolean),
    directPermissions: directRole ? parsePermissionBlob(directRole.permissions) : {}
  };
}

module.exports = {
  DIRECT_USER_ROLE_PREFIX,
  directRoleNameForUser,
  flattenPermissionBlob,
  getUserAccess,
  hasPermissionBlobEntries,
  isDirectUserRole,
  normalizeRoleIdList,
  permissionBlobFromKeys,
  setUserAccess,
  validateDirectPermissionBlob
};
