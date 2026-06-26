/**
 * mother/modules/serverManager/index.js
 *
 * 1) Ensures DB creation (shared schema or own DB),
 * 2) Ensures the "server_locations" table/collection,
 * 3) Sets up meltdown listeners for addServerLocation, getServerLocation, ...
 */
require('dotenv').config();
const {
  ensureServerManagerDatabase,
  ensureSchemaAndTable
} = require('./serverManagerService');

// Because meltdown might double-fire callbacks if we’re careless
const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');

const MODULE_NAME = 'serverManager';
const MODULE_TYPE = 'core';

function assertServerManagerPayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[SERVER MANAGER] ${eventName} => invalid meltdown payload.`);
  }
}

module.exports = {
  async initialize({ motherEmitter, isCore, jwt, nonce }) {
    if (!isCore) {
      throw new Error('[SERVER MANAGER] Must be loaded as a core module.');
    }
    if (!jwt) {
      throw new Error('[SERVER MANAGER] initialization requires a valid JWT token.');
    }
    if (!motherEmitter) {
      throw new Error('[SERVER MANAGER] motherEmitter missing.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    console.log('[SERVER MANAGER] Initializing ServerManager Module...');

    try {
      // 1) Ensure DB or schema
      await ensureServerManagerDatabase(motherEmitter, jwt, nonce);

      // 2) Ensure table/collection or "schema"
      await ensureSchemaAndTable(motherEmitter, jwt, nonce);

      // 3) Register meltdown events (CRUD)
      setupServerManagerEventListeners(motherEmitter);

      console.log('[SERVER MANAGER] Module initialized successfully. Let the meltdown begin!');
    } catch (err) {
      console.error('[SERVER MANAGER] Error initializing =>', err.message);
    }
  }
};

/**
 * setupServerManagerEventListeners:
 *   meltdown => addServerLocation, getServerLocation, listServerLocations,
 *   deleteServerLocation, updateServerLocation
 *
 * Example usage:
 * motherEmitter.emit('addServerLocation', { jwt, serverName, ipAddress }, cb);
 */
function setupServerManagerEventListeners(motherEmitter) {
  console.log('[SERVER MANAGER] Setting up meltdown event listeners for server locations...');

  // ADD SERVER LOCATION
  motherEmitter.on('addServerLocation', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, serverName, ipAddress, notes } = payload || {};
      assertServerManagerPayload(payload, 'addServerLocation');
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'serverManager.createLocation')) {
        return callback(new Error('Forbidden – missing permission: serverManager.createLocation'));
      }
      if (!serverName || !ipAddress) {
        return callback(new Error('serverName and ipAddress are required to add a server location.'));
      }

      motherEmitter.emit(
        'dbInsert',
        {
          jwt,
          moduleName : MODULE_NAME,
          moduleType : MODULE_TYPE,
          table      : '__rawSQL__',
          data       : {
            rawSQL: 'SERVERMANAGER_ADD_LOCATION',
            serverName,
            ipAddress,
            notes: notes || ''
          }
        },
        (err, result) => {
          if (err) return callback(err);
          callback(null, { success: true, location: result });
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // GET SERVER LOCATION by ID
  motherEmitter.on('getServerLocation', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, locationId } = payload || {};
      assertServerManagerPayload(payload, 'getServerLocation');
      if (!jwt) {
        return callback(new Error('[SERVER MANAGER] getServerLocation => missing jwt.'));
      }
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'serverManager.viewLocations')) {
        return callback(new Error('Forbidden – missing permission: serverManager.viewLocations'));
      }
      if (!locationId) {
        return callback(new Error('locationId is required to fetch a server location.'));
      }

      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName: MODULE_NAME,
          moduleType: MODULE_TYPE,
          table     : '__rawSQL__',
          data      : {
            rawSQL: 'SERVERMANAGER_GET_LOCATION',
            locationId
          }
        },
        (err, rows) => {
          if (err) return callback(err);
          callback(null, rows && rows.length ? rows[0] : null);
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // LIST ALL SERVER LOCATIONS
  motherEmitter.on('listServerLocations', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt } = payload || {};
      assertServerManagerPayload(payload, 'listServerLocations');
      if (!jwt) {
        return callback(new Error('[SERVER MANAGER] listServerLocations => missing jwt.'));
      }
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'serverManager.viewLocations')) {
        return callback(new Error('Forbidden – missing permission: serverManager.viewLocations'));
      }

      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName: MODULE_NAME,
          moduleType: MODULE_TYPE,
          table     : '__rawSQL__',
          data      : { rawSQL: 'SERVERMANAGER_LIST_LOCATIONS' }
        },
        (err, rows) => {
          if (err) return callback(err);
          callback(null, rows || []);
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // DELETE SERVER LOCATION
  motherEmitter.on('deleteServerLocation', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, locationId } = payload || {};
      assertServerManagerPayload(payload, 'deleteServerLocation');
      if (!jwt) {
        return callback(new Error('[SERVER MANAGER] deleteServerLocation => missing jwt.'));
      }
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'serverManager.deleteLocation')) {
        return callback(new Error('Forbidden – missing permission: serverManager.deleteLocation'));
      }
      if (!locationId) {
        return callback(new Error('locationId is required.'));
      }

      motherEmitter.emit(
        'dbDelete',
        {
          jwt,
          moduleName: MODULE_NAME,
          moduleType: MODULE_TYPE,
          table     : '__rawSQL__',
          where     : {
            rawSQL: 'SERVERMANAGER_DELETE_LOCATION',
            locationId
          }
        },
        (err) => {
          if (err) return callback(err);
          callback(null, { success: true });
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // UPDATE SERVER LOCATION
  motherEmitter.on('updateServerLocation', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, locationId, newName, newIp, newNotes } = payload || {};
      assertServerManagerPayload(payload, 'updateServerLocation');
      if (!jwt) {
        return callback(new Error('[SERVER MANAGER] updateServerLocation => missing jwt.'));
      }
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'serverManager.editLocation')) {
        return callback(new Error('Forbidden – missing permission: serverManager.editLocation'));
      }
      if (!locationId) {
        return callback(new Error('locationId is required.'));
      }

      motherEmitter.emit(
        'dbUpdate',
        {
          jwt,
          moduleName: MODULE_NAME,
          moduleType: MODULE_TYPE,
          table     : '__rawSQL__',
          data      : {
            rawSQL   : 'SERVERMANAGER_UPDATE_LOCATION',
            locationId,
            newName,
            newIp,
            newNotes
          }
        },
        (err, result) => {
          if (err) return callback(err);
          callback(null, { success: true, updated: result });
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });
}
