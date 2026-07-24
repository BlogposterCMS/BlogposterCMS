'use strict';

const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');
const {
  applySitePreset,
  createSitePreset,
  deleteSitePreset,
  listSitePresets
} = require('./sitePresetsService');

const MODULE_NAME = 'sitePresets';
const MODULE_TYPE = 'core';

function assertSitePresetPayload(payload, eventName) {
  if (
    !payload?.jwt
    || payload.moduleName !== MODULE_NAME
    || payload.moduleType !== MODULE_TYPE
  ) {
    throw new Error(
      `SITE_PRESETS_INVALID_PAYLOAD: ${eventName} requires the sitePresets core boundary.`
    );
  }
}

function requirePermission(payload, permission) {
  if (payload?.decodedJWT && !hasPermission(payload.decodedJWT, permission)) {
    throw new Error(`SITE_PRESETS_FORBIDDEN: missing permission ${permission}.`);
  }
}

function registerEvent(motherEmitter, eventName, permission, handler) {
  motherEmitter.on(eventName, async (payload, originalCallback) => {
    const callback = onceCallback(originalCallback);
    try {
      assertSitePresetPayload(payload, eventName);
      requirePermission(payload, permission);
      callback(null, await handler(payload));
    } catch (error) {
      callback(error);
    }
  });
}

function setupSitePresetEvents(motherEmitter) {
  registerEvent(motherEmitter, 'sitePresets.list', 'builder.use', payload =>
    listSitePresets(motherEmitter, payload.jwt)
  );
  registerEvent(motherEmitter, 'sitePresets.create', 'builder.publish', payload =>
    createSitePreset(motherEmitter, payload.jwt, payload)
  );
  registerEvent(motherEmitter, 'sitePresets.delete', 'builder.publish', payload =>
    deleteSitePreset(motherEmitter, payload.jwt, payload)
  );
  registerEvent(motherEmitter, 'sitePresets.apply', 'builder.publish', payload =>
    applySitePreset(motherEmitter, payload.jwt, payload)
  );
}

module.exports = {
  async initialize({ motherEmitter, isCore, jwt }) {
    if (!isCore) {
      throw new Error('SITE_PRESETS_CORE_REQUIRED: sitePresets must load as a core module.');
    }
    if (!jwt) {
      throw new Error('SITE_PRESETS_JWT_REQUIRED: sitePresets requires an internal JWT.');
    }
    if (!motherEmitter) {
      throw new Error('SITE_PRESETS_EMITTER_REQUIRED: motherEmitter is required.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }
    setupSitePresetEvents(motherEmitter);
    console.log('[SITE PRESETS] Ready.');
  },
  MODULE_NAME,
  MODULE_TYPE,
  setupSitePresetEvents,
  _internals: {
    assertSitePresetPayload,
    requirePermission
  }
};
