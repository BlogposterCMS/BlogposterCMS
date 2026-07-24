'use strict';

const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');
const {
  activateColorScheme,
  createColorScheme,
  createSavedColor,
  deleteColorScheme,
  deleteSavedColor,
  readColorLibrary,
  updateColorScheme,
  updateSavedColor
} = require('./colorLibraryService');

const MODULE_NAME = 'colorLibrary';
const MODULE_TYPE = 'core';

function assertColorLibraryPayload(payload, eventName) {
  if (
    !payload?.jwt ||
    payload.moduleName !== MODULE_NAME ||
    payload.moduleType !== MODULE_TYPE
  ) {
    throw new Error(
      `COLOR_LIBRARY_INVALID_PAYLOAD: ${eventName} requires the colorLibrary core boundary.`
    );
  }
}

function requirePermission(payload, permission) {
  if (permission && payload?.decodedJWT && !hasPermission(payload.decodedJWT, permission)) {
    throw new Error(`COLOR_LIBRARY_FORBIDDEN: missing permission ${permission}.`);
  }
}

function registerEvent(motherEmitter, eventName, permission, handler) {
  motherEmitter.on(eventName, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertColorLibraryPayload(payload, eventName);
      requirePermission(payload, permission);
      callback(null, await handler(payload));
    } catch (error) {
      callback(error);
    }
  });
}

function setupColorLibraryEvents(motherEmitter) {
  registerEvent(motherEmitter, 'colorLibrary.list', 'builder.use', payload =>
    readColorLibrary(motherEmitter, payload.jwt)
  );
  registerEvent(motherEmitter, 'colorLibrary.listPublic', '', payload =>
    readColorLibrary(motherEmitter, payload.jwt)
  );
  registerEvent(motherEmitter, 'colorLibrary.create', 'builder.publish', payload =>
    createSavedColor(motherEmitter, payload.jwt, payload)
  );
  registerEvent(motherEmitter, 'colorLibrary.update', 'builder.publish', payload =>
    updateSavedColor(motherEmitter, payload.jwt, payload)
  );
  registerEvent(motherEmitter, 'colorLibrary.delete', 'builder.publish', payload =>
    deleteSavedColor(motherEmitter, payload.jwt, payload)
  );
  registerEvent(motherEmitter, 'colorLibrary.createScheme', 'builder.publish', payload =>
    createColorScheme(motherEmitter, payload.jwt, payload)
  );
  registerEvent(motherEmitter, 'colorLibrary.updateScheme', 'builder.publish', payload =>
    updateColorScheme(motherEmitter, payload.jwt, payload)
  );
  registerEvent(motherEmitter, 'colorLibrary.activateScheme', 'builder.publish', payload =>
    activateColorScheme(motherEmitter, payload.jwt, payload)
  );
  registerEvent(motherEmitter, 'colorLibrary.deleteScheme', 'builder.publish', payload =>
    deleteColorScheme(motherEmitter, payload.jwt, payload)
  );
}

module.exports = {
  async initialize({ motherEmitter, isCore, jwt }) {
    if (!isCore) {
      throw new Error('COLOR_LIBRARY_CORE_REQUIRED: colorLibrary must load as a core module.');
    }
    if (!jwt) {
      throw new Error('COLOR_LIBRARY_JWT_REQUIRED: colorLibrary requires an internal JWT.');
    }
    if (!motherEmitter) {
      throw new Error('COLOR_LIBRARY_EMITTER_REQUIRED: motherEmitter is required.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }
    setupColorLibraryEvents(motherEmitter);
    console.log('[COLOR LIBRARY] Ready.');
  },
  MODULE_NAME,
  MODULE_TYPE,
  setupColorLibraryEvents,
  _internals: {
    assertColorLibraryPayload,
    requirePermission
  }
};
