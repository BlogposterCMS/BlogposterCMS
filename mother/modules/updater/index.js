'use strict';

const { initializeCoreUpdateEvents } = require('./coreUpdateEvents');
const { startUpdateChecks } = require('./updateScheduler');
const activeEmitters = new WeakSet();

async function initialize({ motherEmitter, isCore, jwt, coreModuleUpdates, isModuleUpdate = false }) {
  if (!isCore || !jwt || !motherEmitter || typeof motherEmitter.on !== 'function') {
    throw new Error('CORE_UPDATE_INIT_INVALID: updater requires the authenticated core lifecycle');
  }
  // Bootstrap retries must not duplicate listeners or background requests.
  if (activeEmitters.has(motherEmitter)) return;
  if (typeof motherEmitter.registerModuleType === 'function') {
    motherEmitter.registerModuleType('updater', 'core');
  }
  initializeCoreUpdateEvents(motherEmitter, { coreModuleUpdates });
  // The host-owned discovery scheduler survives replacing the review handlers.
  if (!isModuleUpdate) startUpdateChecks();
  activeEmitters.add(motherEmitter);
}

async function healthCheck({ coreModuleUpdates }) {
  if (typeof coreModuleUpdates?.snapshot !== 'function') throw new Error('CORE_MODULE_UPDATE_SERVICE_MISSING');
  coreModuleUpdates.snapshot();
}

module.exports = { lifecycleVersion: 1, initialize, healthCheck };
