/**
 * mother/modules/userManagement/permissionCrudEvents.js
 *
 * Registers meltdown events for permission CRUD:
 *   - createPermission
 *   - getAllPermissions
 */
const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('./permissionUtils');

function sanitizePayload(payload, hide = []) {
  const sanitized = { ...(payload || {}) };
  if (sanitized.jwt) sanitized.jwt = '[hidden]';
  if (sanitized.decodedJWT) sanitized.decodedJWT = '[omitted]';
  hide.forEach(k => {
    if (sanitized[k]) sanitized[k] = '***';
  });
  return sanitized;
}

function setupPermissionCrudEvents(motherEmitter) {
  // =============== createPermission ===============
  motherEmitter.on('createPermission', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    console.log('[USER MGMT] "createPermission" event triggered. Payload:', sanitizePayload(payload));

    const { jwt, moduleName, moduleType, permissionKey, description } = payload || {};
    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      return callback(new Error('[USER MGMT] createPermission => invalid meltdown payload.'));
    }
    if (!permissionKey) {
      return callback(new Error('permissionKey is required.'));
    }
    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'userManagement.managePermissions')) {
      return callback(new Error('Forbidden – missing permission: userManagement.managePermissions'));
    }

    motherEmitter.emit('dbInsert', {
      jwt,
      moduleName: 'userManagement',
      table: 'permissions',
      data: {
        permission_key: permissionKey,
        description: description || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    }, (err, insertedRow) => {
      if (err) return callback(err);
      const id = Array.isArray(insertedRow) ? insertedRow[0]?.id : insertedRow?.insertedId;
      callback(null, { permissionId: id });
    });
  });

  // =============== getAllPermissions ===============
  motherEmitter.on('getAllPermissions', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    console.log('[USER MGMT] "getAllPermissions" event triggered. Payload:', sanitizePayload(payload));

    const { jwt, moduleName, moduleType } = payload || {};
    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      return callback(new Error('[USER MGMT] getAllPermissions => invalid meltdown payload.'));
    }

    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'userManagement.managePermissions')) {
      return callback(new Error('Forbidden – missing permission: userManagement.managePermissions'));
    }

    motherEmitter.emit('dbSelect', {
      jwt,
      moduleName: 'userManagement',
      table: 'permissions'
    }, (err, rows) => {
      if (err) return callback(err);
      rows.sort((a, b) => (a.permission_key || '').localeCompare(b.permission_key || ''));
      callback(null, rows);
    });
  });
}

module.exports = { setupPermissionCrudEvents };
