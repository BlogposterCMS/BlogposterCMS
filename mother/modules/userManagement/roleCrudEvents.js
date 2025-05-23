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
const { hasPermission } = require('./permissionUtils');

/**
 * setupRoleCrudEvents:
 *  Registers meltdown events for role-based operations
 *  (create, read, update, delete, etc.) plus incrementUserTokenVersion.
 */
function setupRoleCrudEvents(motherEmitter) {
  // =============== createRole ===============
  motherEmitter.on('createRole', (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    console.log('[USER MGMT] "createRole" event triggered. Payload:', payload);
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
    motherEmitter.emit('dbInsert', {
      jwt,
      moduleName: 'userManagement',
      table: 'roles',
      data: {
        role_name: roleName,
        is_system_role: false,
        description: description || '',
        permissions: JSON.stringify(permJson),
        created_at: new Date(),
        updated_at: new Date()
      }
    }, (err, insertedRow) => {
      if (err) return callback(err);
      if (!insertedRow || !insertedRow.id) {
        return callback(new Error('No row inserted or missing "id"'));
      }
      callback(null, { roleId: insertedRow.id });
    });
  });

  // =============== getAllRoles ===============
  motherEmitter.on('getAllRoles', (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    console.log('[USER MGMT] "getAllRoles" event triggered. Payload:', payload);
    const { jwt, moduleName, moduleType } = payload || {};

    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      return callback(new Error('[USER MGMT] getAllRoles => invalid meltdown payload.'));
    }

    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'userManagement.listRoles')) {
      return callback(new Error('Forbidden – missing permission: userManagement.listRoles'));
    }

    motherEmitter.emit('dbSelect', {
      jwt,
      moduleName: 'userManagement',
      table: 'roles'
    }, (err, rows) => {
      if (err) return callback(err);
      console.log('[DEBUG] all roles from DB:', rows); 
      // Sort by name
      rows.sort((a, b) => (a.role_name || '').localeCompare(b.role_name || ''));
      callback(null, rows);
    });
  });

  // =============== updateRole ===============
  motherEmitter.on('updateRole', (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    console.log('[USER MGMT] "updateRole" event triggered. Payload:', payload);
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
    motherEmitter.emit('dbSelect', {
      jwt,
      moduleName: 'userManagement',
      table: 'roles',
      where: { id: roleId }
    }, (err, rows) => {
      if (err) return callback(err);
      if (!rows || rows.length === 0) {
        return callback(new Error('Role not found.'));
      }

      const existingRole = rows[0];
      // Disallow renaming a system role (like 'admin')
      if (existingRole.is_system_role && newRoleName) {
        return callback(new Error('Cannot rename a system role (e.g., admin).'));
      }

      // Build the update payload
      const updatedData = { updated_at: new Date() };
      if (newRoleName)    updatedData.role_name   = newRoleName;
      if (newDescription) updatedData.description = newDescription;
      if (newPermissions) updatedData.permissions = JSON.stringify(newPermissions);

      motherEmitter.emit('dbUpdate', {
        jwt,
        moduleName: 'userManagement',
        table: 'roles',
        where: { id: roleId },
        data: updatedData
      }, (err2) => {
        if (err2) return callback(err2);
        callback(null, { success: true });
      });
    });
  });

  // =============== deleteRole ===============
  motherEmitter.on('deleteRole', (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    console.log('[USER MGMT] "deleteRole" event triggered. Payload:', payload);
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
    motherEmitter.emit('dbSelect', {
      jwt,
      moduleName: 'userManagement',
      table: 'roles',
      where: { id: roleId }
    }, (checkErr, rows) => {
      if (checkErr) return callback(checkErr);
      if (!rows || rows.length === 0) {
        return callback(new Error('No role found with that ID.'));
      }
      const roleRow = rows[0];
      if (roleRow.is_system_role) {
        return callback(new Error('Cannot delete a system role (e.g. admin).'));
      }

      // 1) Remove references from user_roles
      motherEmitter.emit('dbDelete', {
        jwt,
        moduleName: 'userManagement',
        table: 'user_roles',
        where: { role_id: roleId }
      }, (delErr) => {
        if (delErr) return callback(delErr);

        // 2) Delete the role itself
        motherEmitter.emit('dbDelete', {
          jwt,
          moduleName: 'userManagement',
          table: 'roles',
          where: { id: roleId }
        }, (delErr2) => {
          if (delErr2) return callback(delErr2);
          callback(null, { success: true });
        });
      });
    });
  });

  // =============== assignRoleToUser ===============
  motherEmitter.on('assignRoleToUser', (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    console.log('[USER MGMT] "assignRoleToUser" event triggered. Payload:', payload);
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
    motherEmitter.emit('dbInsert', {
      jwt,
      moduleName: 'userManagement',
      table: 'user_roles',
      data: { user_id: userId, role_id: roleId }
    }, (err) => {
      // If duplicate, just warn and continue
      if (err) {
        if (err.message && err.message.includes('duplicate key')) {
          console.warn('[USER MGMT] assignRoleToUser => Already assigned, ignoring.');
        } else {
          return callback(err);
        }
      }

      // On success => increment the user's token_version
      motherEmitter.emit('dbUpdate', {
        jwt,
        moduleName: 'userManagement',
        table: 'users',
        where: { id: userId },
        data: {
          token_version: { '__raw_expr': 'token_version + 1' }
        }
      }, (verr) => {
        if (verr) console.error('[USER MGMT] assignRoleToUser => token_version error:', verr.message);
        callback(null, { success: true });
      });
    });
  });

  // =============== getRolesForUser ===============
  motherEmitter.on('getRolesForUser', (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    console.log('[USER MGMT] "getRolesForUser" event triggered. Payload:', payload);

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

    console.log('[USER MGMT] getRolesForUser => Emitting "dbSelect" on user_roles for userId:', userId);
    motherEmitter.emit('dbSelect', {
      jwt,
      moduleName: 'userManagement',
      table: 'user_roles',
      where: { user_id: userId }
    }, (err, userRoles) => {
      if (err) {
        console.error('[USER MGMT] getRolesForUser => Error selecting user_roles:', err.message);
        return callback(err);
      }
      if (!userRoles || userRoles.length === 0) {
        console.warn('[USER MGMT] getRolesForUser => No roles assigned to this user.');
        return callback(null, []);
      }

      const roleIds = userRoles.map(ur => ur.role_id);
      console.log('[USER MGMT] getRolesForUser => user_roles found. Role IDs:', roleIds);

      // Now select from 'roles' to return role objects
      motherEmitter.emit('dbSelect', {
        jwt,
        moduleName: 'userManagement',
        table: 'roles'
      }, (err2, allRoles) => {
        if (err2) {
          console.error('[USER MGMT] getRolesForUser => Error selecting roles:', err2.message);
          return callback(err2);
        }
        const matched = (allRoles || []).filter(r => roleIds.includes(r.id));
        console.log('[USER MGMT] getRolesForUser => Matched roles count:', matched?.length || 0);
        callback(null, matched);
      });
    });
  });

  // =============== removeRoleFromUser ===============
  motherEmitter.on('removeRoleFromUser', (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    console.log('[USER MGMT] "removeRoleFromUser" event triggered. Payload:', payload);
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
    motherEmitter.emit('dbDelete', {
      jwt,
      moduleName: 'userManagement',
      table: 'user_roles',
      where: { user_id: userId, role_id: roleId }
    }, (err) => {
      if (err) return callback(err);

      // Then increment token_version
      motherEmitter.emit('dbUpdate', {
        jwt,
        moduleName: 'userManagement',
        table: 'users',
        where: { id: userId },
        data: {
          token_version: { '__raw_expr': 'token_version + 1' }
        }
      }, (verr) => {
        if (verr) console.error('[USER MGMT] removeRoleFromUser => token_version error:', verr.message);
        callback(null, { success: true });
      });
    });
  });

  // =============== incrementUserTokenVersion ===============
  motherEmitter.on('incrementUserTokenVersion', (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    console.log('[USER MGMT] incrementUserTokenVersion => Event triggered. Payload:', payload);
    const { jwt, moduleName, userId } = payload || {};

    if (!jwt || moduleName !== 'userManagement' || !userId) {
      console.error('[USER MGMT] incrementUserTokenVersion => invalid meltdown payload => meltdown meltdown.');
      return callback(new Error('[USER MGMT] incrementUserTokenVersion => invalid payload.'));
    }

    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'userManagement.editUser')) {
      return callback(new Error('Forbidden – missing permission: userManagement.editUser'));
    }

    console.log('[USER MGMT] incrementUserTokenVersion => Fetching current token_version for userId:', userId);
    motherEmitter.emit('dbSelect', {
      jwt,
      moduleName: 'userManagement',
      table: 'users',
      where: { id: userId }
    }, (selectErr, users) => {
      if (selectErr || !users.length) {
        console.error('[USER MGMT] incrementUserTokenVersion => Error or no user found:', selectErr?.message || 'No user');
        return callback(selectErr || new Error('User not found'));
      }

      const currentTokenVersion = users[0].token_version || 0;
      console.log(`[USER MGMT] incrementUserTokenVersion => Current token_version is ${currentTokenVersion}. Incrementing...`);

      motherEmitter.emit('dbUpdate', {
        jwt,
        moduleName: 'userManagement',
        table: 'users',
        where: { id: userId },
        data: { token_version: currentTokenVersion + 1 }
      }, (updateErr) => {
        if (updateErr) {
          console.error('[USER MGMT] incrementUserTokenVersion => Error updating token_version:', updateErr.message);
          return callback(updateErr);
        }
        console.log('[USER MGMT] incrementUserTokenVersion => token_version incremented successfully.');
        callback(null, { success: true });
      });
    });
  });
}

module.exports = { setupRoleCrudEvents };
