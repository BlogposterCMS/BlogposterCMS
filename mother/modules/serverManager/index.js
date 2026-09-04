

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

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
  motherEmitter.on(BACKEND_EVENTS.ADD_SERVER_LOCATION, (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, serverName, ipAddress, notes } = payload || {};
      assertServerManagerPayload(payload, BACKEND_EVENTS.ADD_SERVER_LOCATION);
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'serverManager.createLocation')) {
        return callback(new Error('Forbidden – missing permission: serverManager.createLocation'));
      }
      if (!serverName || !ipAddress) {
        return callback(new Error('serverName and ipAddress are required to add a server location.'));
      }

      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_INSERT, {
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
        }).then(result => {
  callback(null, {
    success: true,
    location: result
  });
}, err => {
  return callback(err);
});
    } catch (ex) {
      callback(ex);
    }
  });

  // GET SERVER LOCATION by ID
  motherEmitter.on(BACKEND_EVENTS.GET_SERVER_LOCATION, (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, locationId } = payload || {};
      assertServerManagerPayload(payload, BACKEND_EVENTS.GET_SERVER_LOCATION);
      if (!jwt) {
        return callback(new Error('[SERVER MANAGER] getServerLocation => missing jwt.'));
      }
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'serverManager.viewLocations')) {
        return callback(new Error('Forbidden – missing permission: serverManager.viewLocations'));
      }
      if (!locationId) {
        return callback(new Error('locationId is required to fetch a server location.'));
      }

      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
          jwt,
          moduleName: MODULE_NAME,
          moduleType: MODULE_TYPE,
          table     : '__rawSQL__',
          data      : {
            rawSQL: 'SERVERMANAGER_GET_LOCATION',
            locationId
          }
        }).then(rows => {
  callback(null, rows && rows.length ? rows[0] : null);
}, err => {
  return callback(err);
});
    } catch (ex) {
      callback(ex);
    }
  });

  // LIST ALL SERVER LOCATIONS
  motherEmitter.on(BACKEND_EVENTS.LIST_SERVER_LOCATIONS, (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt } = payload || {};
      assertServerManagerPayload(payload, BACKEND_EVENTS.LIST_SERVER_LOCATIONS);
      if (!jwt) {
        return callback(new Error('[SERVER MANAGER] listServerLocations => missing jwt.'));
      }
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'serverManager.viewLocations')) {
        return callback(new Error('Forbidden – missing permission: serverManager.viewLocations'));
      }

      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
          jwt,
          moduleName: MODULE_NAME,
          moduleType: MODULE_TYPE,
          table     : '__rawSQL__',
          data      : { rawSQL: 'SERVERMANAGER_LIST_LOCATIONS' }
        }).then(rows => {
  callback(null, rows || []);
}, err => {
  return callback(err);
});
    } catch (ex) {
      callback(ex);
    }
  });

  // DELETE SERVER LOCATION
  motherEmitter.on(BACKEND_EVENTS.DELETE_SERVER_LOCATION, (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, locationId } = payload || {};
      assertServerManagerPayload(payload, BACKEND_EVENTS.DELETE_SERVER_LOCATION);
      if (!jwt) {
        return callback(new Error('[SERVER MANAGER] deleteServerLocation => missing jwt.'));
      }
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'serverManager.deleteLocation')) {
        return callback(new Error('Forbidden – missing permission: serverManager.deleteLocation'));
      }
      if (!locationId) {
        return callback(new Error('locationId is required.'));
      }

      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_DELETE, {
          jwt,
          moduleName: MODULE_NAME,
          moduleType: MODULE_TYPE,
          table     : '__rawSQL__',
          where     : {
            rawSQL: 'SERVERMANAGER_DELETE_LOCATION',
            locationId
          }
        }).then(() => {
  callback(null, {
    success: true
  });
}, err => {
  return callback(err);
});
    } catch (ex) {
      callback(ex);
    }
  });

  // UPDATE SERVER LOCATION
  motherEmitter.on(BACKEND_EVENTS.UPDATE_SERVER_LOCATION, (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, locationId, newName, newIp, newNotes } = payload || {};
      assertServerManagerPayload(payload, BACKEND_EVENTS.UPDATE_SERVER_LOCATION);
      if (!jwt) {
        return callback(new Error('[SERVER MANAGER] updateServerLocation => missing jwt.'));
      }
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'serverManager.editLocation')) {
        return callback(new Error('Forbidden – missing permission: serverManager.editLocation'));
      }
      if (!locationId) {
        return callback(new Error('locationId is required.'));
      }

      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
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
        }).then(result => {
  callback(null, {
    success: true,
    updated: result
  });
}, err => {
  return callback(err);
});
    } catch (ex) {
      callback(ex);
    }
  });
}
