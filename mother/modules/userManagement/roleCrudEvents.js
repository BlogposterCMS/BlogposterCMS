

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

/**
 * mother/modules/userManagement/roleCrudEvents.js
 *
 * meltdown event listeners for role CRUD:
 *   - createRole
 *   - getAllRoles
 *   - updateRole
 *   - deleteRole
 *   - assignRoleToUser
 *   - removeRoleFromUser
 *   - getRolesForUser
 *   - incrementUserTokenVersion
 */

// We'll keep a TIMEOUT_DURATION if you want to wrap certain operations in timeouts.
const TIMEOUT_DURATION = 5000;

// meltdown meltdown...
const { onceCallback } = require('../../emitters/motherEmitter');
const { traceRuntimeEvent } = require('../../utils/runtimeLogging');
const { hasPermission } = require('./permissionUtils');
const { getDbType } = require('../databaseManager/helpers/dbTypeHelpers');
const {
  getUserAccess,
  setUserAccess
} = require('./userAccessService');

function sanitizePayload(payload, hide = []) {
  const sanitized = { ...(payload || {}) };
  if (sanitized.jwt) sanitized.jwt = '[hidden]';
  if (sanitized.decodedJWT) sanitized.decodedJWT = '[omitted]';
  hide.forEach(k => {
    if (sanitized[k]) sanitized[k] = '***';
  });
  return sanitized;
}

/**
 * setupRoleCrudEvents:
 *  Registers meltdown events for role-based operations
 *  (create, read, update, delete, etc.) plus incrementUserTokenVersion.
 */
function setupRoleCrudEvents(motherEmitter) {
  // =============== createRole ===============
  motherEmitter.on(BACKEND_EVENTS.CREATE_ROLE, (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    traceRuntimeEvent('[USER MGMT] "createRole" event triggered. Payload:', sanitizePayload(payload));
    const { jwt, moduleName, moduleType, roleName, description, permissions } = payload || {};

    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      return callback(new Error('[USER MGMT] createRole => invalid meltdown payload.'));
    }
    if (!roleName) {
      return callback(new Error('roleName is required.'));
    }

    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'userManagement.createRole')) {
      return callback(new Error('Forbidden – missing permission: userManagement.createRole'));
    }

    const permJson = permissions || {};
    requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_INSERT, {
      jwt,
      moduleName: 'userManagement',
      table: 'roles',
      data: {
        role_name: roleName,
        is_system_role: false,
        description: description || '',
        permissions: JSON.stringify(permJson),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    }).then(insertedRow => {
  if (!insertedRow || !insertedRow.id) {
    return callback(new Error('No row inserted or missing "id"'));
  }
  callback(null, {
    roleId: insertedRow.id
  });
}, err => {
  return callback(err);
});
  });

  // =============== getAllRoles ===============
  motherEmitter.on(BACKEND_EVENTS.GET_ALL_ROLES, (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    traceRuntimeEvent('[USER MGMT] "getAllRoles" event triggered. Payload:', sanitizePayload(payload));
    const { jwt, moduleName, moduleType } = payload || {};

    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      return callback(new Error('[USER MGMT] getAllRoles => invalid meltdown payload.'));
    }

    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'userManagement.listRoles')) {
      return callback(new Error('Forbidden – missing permission: userManagement.listRoles'));
    }

    requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
      jwt,
      moduleName: 'userManagement',
      table: 'roles'
    }).then(rows => {
  traceRuntimeEvent('[USER MGMT] getAllRoles => count:', rows?.length || 0);
  // Sort by name
  // Sort by name
  rows.sort((a, b) => (a.role_name || '').localeCompare(b.role_name || ''));
  callback(null, rows);
}, err => {
  return callback(err);
});
  });

  // =============== getUserAccess ===============
  motherEmitter.on(BACKEND_EVENTS.GET_USER_ACCESS, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    traceRuntimeEvent('[USER MGMT] "getUserAccess" event triggered. Payload:', sanitizePayload(payload));
    const { jwt, moduleName, moduleType, userId } = payload || {};

    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      return callback(new Error('[USER MGMT] getUserAccess => invalid meltdown payload.'));
    }
    if (!userId) {
      return callback(new Error('[E_USER_ACCESS_USER_ID_MISSING] userId is required.'));
    }
    if (
      payload.decodedJWT &&
      !hasPermission(payload.decodedJWT, 'userManagement.listRoles') &&
      !hasPermission(payload.decodedJWT, 'users.read')
    ) {
      return callback(new Error('Forbidden â€“ missing permission: userManagement.listRoles'));
    }

    try {
      callback(null, await getUserAccess(motherEmitter, jwt, userId));
    } catch (err) {
      callback(err);
    }
  });

  // =============== setUserAccess ===============
  motherEmitter.on(BACKEND_EVENTS.SET_USER_ACCESS, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    traceRuntimeEvent('[USER MGMT] "setUserAccess" event triggered. Payload:', sanitizePayload(payload));
    const { jwt, moduleName, moduleType, userId, roleIds, directPermissions } = payload || {};

    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      return callback(new Error('[USER MGMT] setUserAccess => invalid meltdown payload.'));
    }
    if (!userId) {
      return callback(new Error('[E_USER_ACCESS_USER_ID_MISSING] userId is required.'));
    }
    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'userManagement.editUser')) {
      return callback(new Error('Forbidden â€“ missing permission: userManagement.editUser'));
    }

    try {
      callback(null, await setUserAccess(motherEmitter, jwt, userId, roleIds, directPermissions));
    } catch (err) {
      callback(err);
    }
  });

  // =============== updateRole ===============
  motherEmitter.on(BACKEND_EVENTS.UPDATE_ROLE, (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    traceRuntimeEvent('[USER MGMT] "updateRole" event triggered. Payload:', sanitizePayload(payload));
    const { jwt, moduleName, moduleType, roleId, newRoleName, newDescription, newPermissions } = payload || {};

    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      return callback(new Error('[USER MGMT] updateRole => invalid meltdown payload.'));
    }
    if (!roleId) {
      return callback(new Error('Missing roleId.'));
    }

    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'userManagement.editRole')) {
      return callback(new Error('Forbidden – missing permission: userManagement.editRole'));
    }

    // First, fetch the existing role
    requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
      jwt,
      moduleName: 'userManagement',
      table: 'roles',
      where: { id: roleId }
    }).then(rows => {
  if (!rows || rows.length === 0) {
    return callback(new Error('Role not found.'));
  }
  const existingRole = rows[0];
  // Disallow renaming a system role (like 'admin')
  if (existingRole.is_system_role && newRoleName) {
    return callback(new Error('Cannot rename a system role (e.g., admin).'));
  }
  // Build the update payload
  const updatedData = {
    updated_at: new Date().toISOString()
  };
  if (newRoleName) updatedData.role_name = newRoleName;
  if (newDescription) updatedData.description = newDescription;
  if (newPermissions) updatedData.permissions = JSON.stringify(newPermissions);
  requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
    jwt,
    moduleName: 'userManagement',
    table: 'roles',
    where: {
      id: roleId
    },
    data: updatedData
  }).then(() => {
    callback(null, {
      success: true
    });
  }, err2 => {
    return callback(err2);
  });
}, err => {
  return callback(err);
});
  });

  // =============== deleteRole ===============
  motherEmitter.on(BACKEND_EVENTS.DELETE_ROLE, (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    traceRuntimeEvent('[USER MGMT] "deleteRole" event triggered. Payload:', sanitizePayload(payload));
    const { jwt, moduleName, moduleType, roleId } = payload || {};

    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      return callback(new Error('[USER MGMT] deleteRole => invalid meltdown payload.'));
    }
    if (!roleId) {
      return callback(new Error('Missing roleId.'));
    }

    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'userManagement.deleteRole')) {
      return callback(new Error('Forbidden – missing permission: userManagement.deleteRole'));
    }

    // Check if the role is system or not
    requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
      jwt,
      moduleName: 'userManagement',
      table: 'roles',
      where: { id: roleId }
    }).then(rows => {
  if (!rows || rows.length === 0) {
    return callback(new Error('No role found with that ID.'));
  }
  const roleRow = rows[0];
  if (roleRow.is_system_role) {
    return callback(new Error('Cannot delete a system role (e.g. admin).'));
  }
  // 1) Remove references from user_roles
  requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_DELETE, {
    jwt,
    moduleName: 'userManagement',
    table: 'user_roles',
    where: {
      role_id: roleId
    }
  }).then(() => {
    // 2) Delete the role itself
    requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_DELETE, {
      jwt,
      moduleName: 'userManagement',
      table: 'roles',
      where: {
        id: roleId
      }
    }).then(() => {
      callback(null, {
        success: true
      });
    }, delErr2 => {
      return callback(delErr2);
    });
  }, delErr => {
    return callback(delErr);
  });
}, checkErr => {
  return callback(checkErr);
});
  });

  // =============== assignRoleToUser ===============
  motherEmitter.on(BACKEND_EVENTS.ASSIGN_ROLE_TO_USER, (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    traceRuntimeEvent('[USER MGMT] "assignRoleToUser" event triggered. Payload:', sanitizePayload(payload));
    const { jwt, moduleName, moduleType, userId, roleId } = payload || {};

    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      return callback(new Error('[USER MGMT] assignRoleToUser => invalid meltdown payload.'));
    }
    if (!userId || !roleId) {
      return callback(new Error('Missing userId or roleId.'));
    }

    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'userManagement.editRole')) {
      return callback(new Error('Forbidden – missing permission: userManagement.editRole'));
    }

    // Insert into user_roles
    requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_INSERT, {
      jwt,
      moduleName: 'userManagement',
      table: 'user_roles',
      data: { user_id: userId, role_id: roleId }
    }).then(() => {
  // On success => increment the user's token_version
  const idField = getDbType() === 'mongodb' ? '_id' : 'id';
  requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
    jwt,
    moduleName: 'userManagement',
    table: 'users',
    where: {
      [idField]: userId
    },
    data: {
      token_version: {
        '__raw_expr': 'token_version + 1'
      }
    }
  }).then(() => {
    callback(null, {
      success: true
    });
  }, verr => {
    console.error('[USER MGMT] assignRoleToUser => token_version error:', verr.message);
  });
}, err => {
  if (err.message && err.message.includes('duplicate key')) {
    console.warn('[USER MGMT] assignRoleToUser => Already assigned, ignoring.');
  } else {
    return callback(err);
  }
});
  });

  // =============== getRolesForUser ===============
  motherEmitter.on(BACKEND_EVENTS.GET_ROLES_FOR_USER, (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    traceRuntimeEvent('[USER MGMT] "getRolesForUser" event triggered. Payload:', sanitizePayload(payload));

    const { jwt, moduleName, moduleType, userId } = payload || {};
    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      console.error('[USER MGMT] getRolesForUser => Invalid meltdown payload => meltdown meltdown.');
      return callback(new Error('[USER MGMT] getRolesForUser => invalid meltdown payload.'));
    }
    if (!userId) {
      console.error('[USER MGMT] getRolesForUser => Missing userId => meltdown meltdown.');
      return callback(new Error('Missing userId.'));
    }

    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'userManagement.listRoles')) {
      return callback(new Error('Forbidden – missing permission: userManagement.listRoles'));
    }

    traceRuntimeEvent('[USER MGMT] getRolesForUser => selecting roles for userId:', userId);
    requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
      jwt,
      moduleName: 'userManagement',
      table: 'user_roles',
      where: { user_id: userId }
    }).then(userRoles => {
  if (!userRoles || userRoles.length === 0) {
    console.warn('[USER MGMT] getRolesForUser => No roles assigned to this user.');
    return callback(null, []);
  }
  // Normalize to string to avoid ObjectId strict equality issues
  const roleIds = userRoles.map(ur => String(ur.role_id));
  traceRuntimeEvent('[USER MGMT] getRolesForUser => role IDs:', roleIds);

  // Now select from 'roles' to return role objects
  // Now select from 'roles' to return role objects
  requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
    jwt,
    moduleName: 'userManagement',
    table: 'roles'
  }).then(allRoles => {
    const matched = (allRoles || []).filter(r => roleIds.includes(String(r.id)));
    traceRuntimeEvent('[USER MGMT] getRolesForUser => matched roles:', matched?.length || 0);
    callback(null, matched);
  }, err2 => {
    console.error('[USER MGMT] getRolesForUser => Error selecting roles:', err2.message);
    return callback(err2);
  });
}, err => {
  console.error('[USER MGMT] getRolesForUser => Error selecting user_roles:', err.message);
  return callback(err);
});
  });

  // =============== removeRoleFromUser ===============
  motherEmitter.on(BACKEND_EVENTS.REMOVE_ROLE_FROM_USER, (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    traceRuntimeEvent('[USER MGMT] "removeRoleFromUser" event triggered. Payload:', sanitizePayload(payload));
    const { jwt, moduleName, moduleType, userId, roleId } = payload || {};

    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      return callback(new Error('[USER MGMT] removeRoleFromUser => invalid meltdown payload.'));
    }
    if (!userId || !roleId) {
      return callback(new Error('Missing userId or roleId.'));
    }

    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'userManagement.editRole')) {
      return callback(new Error('Forbidden – missing permission: userManagement.editRole'));
    }

    // Delete the row from user_roles
    requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_DELETE, {
      jwt,
      moduleName: 'userManagement',
      table: 'user_roles',
      where: { user_id: userId, role_id: roleId }
    }).then(() => {
  // Then increment token_version
  const idField = getDbType() === 'mongodb' ? '_id' : 'id';
  requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
    jwt,
    moduleName: 'userManagement',
    table: 'users',
    where: {
      [idField]: userId
    },
    data: {
      token_version: {
        '__raw_expr': 'token_version + 1'
      }
    }
  }).then(() => {
    callback(null, {
      success: true
    });
  }, verr => {
    console.error('[USER MGMT] removeRoleFromUser => token_version error:', verr.message);
  });
}, err => {
  return callback(err);
});
  });

  // =============== incrementUserTokenVersion ===============
  motherEmitter.on(BACKEND_EVENTS.INCREMENT_USER_TOKEN_VERSION, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    traceRuntimeEvent('[USER MGMT] incrementUserTokenVersion => Event triggered. Payload:', sanitizePayload(payload));
    const { jwt, moduleName, moduleType, userId } = payload || {};

    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core' || !userId) {
      console.error('[USER MGMT] incrementUserTokenVersion => invalid meltdown payload => meltdown meltdown.');
      return callback(new Error('[USER MGMT] incrementUserTokenVersion => invalid payload.'));
    }

    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'userManagement.editUser')) {
      return callback(new Error('Forbidden – missing permission: userManagement.editUser'));
    }

    traceRuntimeEvent('[USER MGMT] incrementUserTokenVersion => fetching current version for userId:', userId);
    const idField = getDbType() === 'mongodb' ? '_id' : 'id';
    try {
      const users = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
        jwt,
        moduleName: 'userManagement',
        moduleType: 'core',
        table: 'users',
        where: { [idField]: userId }
      });
      if (!users.length) {
        console.error('[USER MGMT] incrementUserTokenVersion => No user found');
        return callback(new Error('User not found'));
      }

      const currentTokenVersion = users[0].token_version || 0;
      traceRuntimeEvent(`[USER MGMT] incrementUserTokenVersion => current version is ${currentTokenVersion}`);

      await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
        jwt,
        moduleName: 'userManagement',
        moduleType: 'core',
        table: 'users',
        where: { [idField]: userId },
        data: { token_version: currentTokenVersion + 1 }
      });
      traceRuntimeEvent('[USER MGMT] incrementUserTokenVersion => version incremented successfully.');
      callback(null, { success: true });
    } catch (err) {
      console.error('[USER MGMT] incrementUserTokenVersion => Error updating token_version:', err.message);
      callback(err);
    }
  });
}

module.exports = { setupRoleCrudEvents };
