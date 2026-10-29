'use strict';

const { loadIntegrations } = require('./notificationManagerService');
const deliveries = new WeakMap();

/** Existing delivery integrations belong to the host and survive reader updates. */
async function initializeNotificationDelivery(notificationEmitter, stateOptions) {
  if (deliveries.has(notificationEmitter)) return deliveries.get(notificationEmitter);
  const starting = (async () => {
    const integrations = await loadIntegrations(stateOptions);
    const activeInstances = {};
    for (const name of Object.keys(integrations)) {
      const integration = integrations[name];
      if (!integration.active) continue;
      try {
        if (typeof integration.module.verify === 'function') await integration.module.verify(integration.config);
        activeInstances[name] = await integration.module.initialize(integration.config);
      } catch (err) {
        console.error(`[NOTIFICATION MANAGER] Init "${name}" failed =>`, err.message);
      }
    }
    notificationEmitter.on('notify', async payload => {
      const { notificationType, priority } = payload;
      console.log('[NOTIFICATION MANAGER] Received notification =>', { notificationType, priority });
      for (const name of Object.keys(activeInstances)) {
        try { await activeInstances[name].notify(payload); }
        catch (err) { console.error(`[NOTIFICATION MANAGER] Integration "${name}" error =>`, err.message); }
      }
    });
  })();
  deliveries.set(notificationEmitter, starting);
  try { await starting; }
  catch (error) { deliveries.delete(notificationEmitter); throw error; }
}

module.exports = { initializeNotificationDelivery };
