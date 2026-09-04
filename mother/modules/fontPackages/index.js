'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');
const {
  activateFontPackage,
  createFontPackage,
  deleteFontPackage,
  readFontPackages,
  readPublicFontPackage,
  resetFontPackageRole,
  updateFontPackage,
  updateFontPackageRole
} = require('./fontPackagesService');

const MODULE_NAME = 'fontPackages';
const MODULE_TYPE = 'core';

function assertFontPackagesPayload(payload, eventName) {
  if (
    !payload?.jwt ||
    payload.moduleName !== MODULE_NAME ||
    payload.moduleType !== MODULE_TYPE
  ) {
    throw new Error(
      `FONT_PACKAGES_INVALID_PAYLOAD: ${eventName} requires the fontPackages core boundary.`
    );
  }
}

function requirePermission(payload, permission) {
  if (permission && payload?.decodedJWT && !hasPermission(payload.decodedJWT, permission)) {
    throw new Error(`FONT_PACKAGES_FORBIDDEN: missing permission ${permission}.`);
  }
}

function registerEvent(motherEmitter, eventName, permission, handler) {
  motherEmitter.on(eventName, async (payload, originalCallback) => {
    const callback = onceCallback(originalCallback);
    try {
      assertFontPackagesPayload(payload, eventName);
      requirePermission(payload, permission);
      callback(null, await handler(payload));
    } catch (error) {
      callback(error);
    }
  });
}

function setupFontPackageEvents(motherEmitter) {
  registerEvent(motherEmitter, BACKEND_EVENTS.FONT_PACKAGES_LIST, 'builder.use', payload =>
    readFontPackages(motherEmitter, payload.jwt)
  );
  registerEvent(motherEmitter, BACKEND_EVENTS.FONT_PACKAGES_GET_PUBLIC, '', payload =>
    readPublicFontPackage(motherEmitter, payload.jwt)
  );
  registerEvent(motherEmitter, BACKEND_EVENTS.FONT_PACKAGES_CREATE, 'builder.publish', payload =>
    createFontPackage(motherEmitter, payload.jwt, payload)
  );
  registerEvent(motherEmitter, BACKEND_EVENTS.FONT_PACKAGES_UPDATE, 'builder.publish', payload =>
    updateFontPackage(motherEmitter, payload.jwt, payload)
  );
  registerEvent(motherEmitter, BACKEND_EVENTS.FONT_PACKAGES_UPDATE_ROLE, 'builder.publish', payload =>
    updateFontPackageRole(motherEmitter, payload.jwt, payload)
  );
  registerEvent(motherEmitter, BACKEND_EVENTS.FONT_PACKAGES_RESET_ROLE, 'builder.publish', payload =>
    resetFontPackageRole(motherEmitter, payload.jwt, payload)
  );
  registerEvent(motherEmitter, BACKEND_EVENTS.FONT_PACKAGES_ACTIVATE, 'builder.publish', payload =>
    activateFontPackage(motherEmitter, payload.jwt, payload)
  );
  registerEvent(motherEmitter, BACKEND_EVENTS.FONT_PACKAGES_DELETE, 'builder.publish', payload =>
    deleteFontPackage(motherEmitter, payload.jwt, payload)
  );
}

module.exports = {
  async initialize({ motherEmitter, isCore, jwt }) {
    if (!isCore) {
      throw new Error('FONT_PACKAGES_CORE_REQUIRED: fontPackages must load as a core module.');
    }
    if (!jwt) {
      throw new Error('FONT_PACKAGES_JWT_REQUIRED: fontPackages requires an internal JWT.');
    }
    if (!motherEmitter) {
      throw new Error('FONT_PACKAGES_EMITTER_REQUIRED: motherEmitter is required.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }
    setupFontPackageEvents(motherEmitter);
    console.log('[FONT PACKAGES] Ready.');
  },
  MODULE_NAME,
  MODULE_TYPE,
  setupFontPackageEvents,
  _internals: {
    assertFontPackagesPayload,
    requirePermission
  }
};
