'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { getCoreUpdateStatus, requestHost } = require('./coreUpdateService');
const { hasPermission } = require('../userManagement/permissionUtils');

function assertCoreUpdateActor(payload) {
  if (payload?.moduleName !== 'updater' || payload?.moduleType !== 'core' || !payload.jwt ||
      !payload.decodedJWT || payload.decodedJWT.isPublic === true || !hasPermission(payload.decodedJWT, 'settings.core.edit')) {
    throw new Error('CORE_UPDATE_FORBIDDEN: missing settings.core.edit');
  }
}

function initializeCoreUpdateEvents(emitter, { coreModuleUpdates } = {}) {
  let dispatchingInstall = false;
  function withModules(state, force = false) {
    if (!coreModuleUpdates) return state;
    coreModuleUpdates.observeRelease(state, { force });
    return { ...state, moduleUpdates: coreModuleUpdates.snapshot(), moduleUpdateBatch: coreModuleUpdates.batchSnapshot() };
  }
  // These listeners also serve the existing Runtime Manager agent interface.
  emitter.on(BACKEND_EVENTS.GET_CORE_UPDATE_STATUS, async (payload, callback) => {
    try { assertCoreUpdateActor(payload); callback(null, withModules(await getCoreUpdateStatus())); }
    catch (err) { callback(err); }
  });
  emitter.on(BACKEND_EVENTS.CHECK_CORE_UPDATE, async (payload, callback) => {
    try { assertCoreUpdateActor(payload); callback(null, withModules(await requestHost('check'), true)); }
    catch (err) { callback(err); }
  });
  emitter.on(BACKEND_EVENTS.INSTALL_CORE_UPDATE, async (payload, callback) => {
    let ownsDispatch = false;
    try {
      assertCoreUpdateActor(payload);
      // Cancellation retains the existing install permission and exact job identity.
      if (payload.operation === 'cancel') {
        if (['targetModules', 'targetModuleName', 'image', 'version', 'generationId'].some(key => payload[key] !== undefined)) throw new Error('CORE_UPDATE_CANCEL_INVALID');
        callback(null, await requestHost('cancel', { jobId: payload.jobId }));
        return;
      }
      if (payload.operation !== undefined) throw new Error('CORE_UPDATE_ACTION_DENIED');
      if (dispatchingInstall || coreModuleUpdates?.busy()) throw new Error('CORE_UPDATE_BUSY');
      dispatchingInstall = true;
      ownsDispatch = true;
      if (payload.targetModules !== undefined && (payload.targetModuleName !== undefined || payload.image !== undefined || payload.version !== undefined || payload.generationId !== undefined)) throw new Error('CORE_MODULE_SELECTION_INVALID');
      if (payload.targetModuleName !== undefined || payload.targetModules !== undefined) {
        if (!coreModuleUpdates) throw new Error('CORE_MODULE_UPDATES_UNAVAILABLE');
        const host = await getCoreUpdateStatus();
        if (!host.configured) throw new Error('CORE_MODULE_HOST_STATE_UNAVAILABLE');
        if (['installing', 'downloading', 'cancelling', 'backing_up', 'restarting', 'verifying', 'rolling_back', 'recovery_failed'].includes(host.phase)) throw new Error('CORE_UPDATE_BUSY');
        callback(null, payload.targetModules !== undefined ? coreModuleUpdates.installBatch(payload.targetModules)
          : coreModuleUpdates.install({ moduleName: payload.targetModuleName, generationId: payload.generationId, version: payload.version }));
        return;
      }
      // Only the reviewed version/digest cross the privileged host boundary.
      callback(null, await requestHost('install', { version: payload.version, image: payload.image }));
    } catch (err) { callback(err); }
    finally { if (ownsDispatch) dispatchingInstall = false; }
  });
}

module.exports = { initializeCoreUpdateEvents, assertCoreUpdateActor };
