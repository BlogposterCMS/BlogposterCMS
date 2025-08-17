/**
 * mother/modules/notificationManager/index.js
 */
const notificationEmitter = require('../../emitters/notificationEmitter');
const { loadIntegrations, getRecentNotifications } = require('./notificationManagerService');
const { onceCallback } = require('../../emitters/motherEmitter');

module.exports = {
  async initialize({ motherEmitter, app, isCore, jwt }) {
    if (!isCore) {
      console.error('[NOTIFICATION MANAGER] Must be loaded as a core module.');
      return;
    }

    console.log('[NOTIFICATION MANAGER] Initializing...');

    // Lade alle Integrationen
    const integrations = await loadIntegrations();

    // Initialisiere aktive Integrationen einmalig
    const activeInstances = {};
    for (const name of Object.keys(integrations)) {
      const integration = integrations[name];
      if (!integration.active) continue;
      try {
        if (typeof integration.module.verify === 'function') {
          await integration.module.verify(integration.config);
        }
        activeInstances[name] = await integration.module.initialize(integration.config);
      } catch (err) {
        console.error(`[NOTIFICATION MANAGER] Init "${name}" failed =>`, err.message);
      }
    }

    // NotificationEmitter-Listener => verarbeiten Notifications
    notificationEmitter.on('notify', async (payload) => {
      const { notificationType, priority } = payload;
      console.log('[NOTIFICATION MANAGER] Received notification =>', { notificationType, priority });

      for (const name of Object.keys(activeInstances)) {
        try {
          await activeInstances[name].notify(payload);
        } catch (err) {
          console.error(`[NOTIFICATION MANAGER] Integration "${name}" error =>`, err.message);
        }
      }
    });

    motherEmitter.on('getRecentNotifications', (payload, cb) => {
      const callback = onceCallback(cb);
      try {
        const { jwt, limit = 10 } = payload || {};
        if (!jwt) {
          return callback(new Error('[NOTIFICATION MANAGER] getRecentNotifications => missing jwt.'));
        }
        const list = getRecentNotifications(limit);
        callback(null, list);
      } catch (err) {
        callback(err);
      }
    });

    console.log('[NOTIFICATION MANAGER] Ready.');
  }
};
