

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');
const { requestBackendEvent } = require('../../contracts/backendEventContracts');

/**
 * mother/modules/notificationManager/index.js
 */
const notificationEmitter = require('../../emitters/notificationEmitter');
const { getRecentNotifications, resolveStatePaths, _internals } = require('./notificationManagerService');
const { initializeNotificationDelivery } = require('./notificationDelivery');
const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');
const { coreUpdateNotification } = require('../updater/coreUpdateService');

const MODULE_NAME = 'notificationManager';
const MODULE_TYPE = 'core';

function assertNotificationPayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[NOTIFICATION MANAGER] ${eventName} => invalid meltdown payload.`);
  }
}

module.exports = {
  lifecycleVersion: 1,
  async healthCheck({ notificationStateDir }) {
    const options = notificationStateDir ? { stateDir: notificationStateDir } : {};
    _internals.readRegistryFile(resolveStatePaths(options).registryPath, 'persistent notification registry');
  },
  async initialize({ motherEmitter, app, isCore, jwt, notificationStateDir, isModuleUpdate = false }) {
    if (!isCore) {
      throw new Error('[NOTIFICATION MANAGER] Must be loaded as a core module.');
    }
    if (!motherEmitter) {
      throw new Error('[NOTIFICATION MANAGER] motherEmitter missing.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    console.log('[NOTIFICATION MANAGER] Initializing...');

    // Lade alle Integrationen
    // Production uses /app/data/notificationManager. Tests may inject an
    // isolated state directory without changing the runtime authority.
    const stateOptions = notificationStateDir ? { stateDir: notificationStateDir } : {};
    if (!isModuleUpdate) await initializeNotificationDelivery(notificationEmitter, stateOptions);

    motherEmitter.on(BACKEND_EVENTS.GET_RECENT_NOTIFICATIONS, async (payload, cb) => {
      const callback = onceCallback(cb);
      try {
        const { limit = 10 } = payload || {};
        assertNotificationPayload(payload, BACKEND_EVENTS.GET_RECENT_NOTIFICATIONS);
        if (payload?.decodedJWT && !hasPermission(payload.decodedJWT, 'notifications.read')) {
          return callback(new Error('Forbidden - missing permission: notifications.read'));
        }
        const list = getRecentNotifications(limit, stateOptions);
        // A single stable, current notification; host state owns release discovery.
        // Editors without update permission never see host update information.
        if (payload.includeCoreUpdates === true && payload?.decodedJWT && hasPermission(payload.decodedJWT, 'settings.core.edit')) {
          try {
            const state = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_CORE_UPDATE_STATUS, {
              jwt, moduleName: 'updater', moduleType: 'core'
            });
            const notice = coreUpdateNotification(state);
            if (notice) list.unshift(notice);
          } catch {
            // Update transport failure must not hide ordinary notifications.
            console.warn('CORE_UPDATE_NOTIFICATION_UNAVAILABLE');
          }
        }
        callback(null, list);
      } catch (err) {
        callback(err);
      }
    });

    console.log('[NOTIFICATION MANAGER] Ready.');
  }
};
