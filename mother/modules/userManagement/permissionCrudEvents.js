

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

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
  motherEmitter.on(BACKEND_EVENTS.CREATE_PERMISSION, (payload, originalCb) => {
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

    requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_INSERT, {
      jwt,
      moduleName: 'userManagement',
      table: 'permissions',
      data: {
        permission_key: permissionKey,
        description: description || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    }).then(insertedRow => {
  const id = Array.isArray(insertedRow) ? insertedRow[0]?.id : insertedRow?.insertedId;
  callback(null, {
    permissionId: id
  });
}, err => {
  return callback(err);
});
  });

  // =============== getAllPermissions ===============
  motherEmitter.on(BACKEND_EVENTS.GET_ALL_PERMISSIONS, (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    console.log('[USER MGMT] "getAllPermissions" event triggered. Payload:', sanitizePayload(payload));

    const { jwt, moduleName, moduleType } = payload || {};
    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      return callback(new Error('[USER MGMT] getAllPermissions => invalid meltdown payload.'));
    }

    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'userManagement.managePermissions')) {
      return callback(new Error('Forbidden – missing permission: userManagement.managePermissions'));
    }

    requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
      jwt,
      moduleName: 'userManagement',
      table: 'permissions'
    }).then(rows => {
  rows.sort((a, b) => (a.permission_key || '').localeCompare(b.permission_key || ''));
  callback(null, rows);
}, err => {
  return callback(err);
});
  });
}

module.exports = { setupPermissionCrudEvents };
