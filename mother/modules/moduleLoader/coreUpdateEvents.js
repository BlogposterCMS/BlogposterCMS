'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { getCoreUpdateStatus, requestHost } = require('./coreUpdateService');
const { hasPermission } = require('../userManagement/permissionUtils');

function assertCoreUpdateActor(payload) {
  if (payload?.moduleName !== 'moduleLoader' || payload?.moduleType !== 'core' || !payload.jwt ||
      !payload.decodedJWT || payload.decodedJWT.isPublic === true || !hasPermission(payload.decodedJWT, 'settings.core.edit')) {
    throw new Error('CORE_UPDATE_FORBIDDEN: missing settings.core.edit');
  }
}

function initializeCoreUpdateEvents(emitter) {
  // These listeners also serve the existing Runtime Manager agent interface.
  emitter.on(BACKEND_EVENTS.GET_CORE_UPDATE_STATUS, async (payload, callback) => {
    try { assertCoreUpdateActor(payload); callback(null, await getCoreUpdateStatus()); }
    catch (err) { callback(err); }
  });
  emitter.on(BACKEND_EVENTS.CHECK_CORE_UPDATE, async (payload, callback) => {
    try { assertCoreUpdateActor(payload); callback(null, await requestHost('check')); }
    catch (err) { callback(err); }
  });
  emitter.on(BACKEND_EVENTS.INSTALL_CORE_UPDATE, async (payload, callback) => {
    try {
      assertCoreUpdateActor(payload);
      // Only the reviewed version/digest cross the privileged host boundary.
      callback(null, await requestHost('install', { version: payload.version, image: payload.image }));
    } catch (err) { callback(err); }
  });
}

module.exports = { initializeCoreUpdateEvents, assertCoreUpdateActor };
