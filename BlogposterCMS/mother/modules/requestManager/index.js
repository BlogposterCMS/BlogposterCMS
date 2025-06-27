'use strict';

const axios = require('axios');
const { onceCallback } = require('../../emitters/motherEmitter');
const notificationEmitter = require('../../emitters/notificationEmitter');

const allowedModules = ['databaseManager', 'news'];

module.exports = {
  async initialize({ motherEmitter, isCore }) {
    if (!isCore) {
      throw new Error('[REQUEST MANAGER] Must be loaded as a core module.');
    }

    notificationEmitter.notify({
      moduleName: 'requestManager',
      notificationType: 'system',
      priority: 'info',
      message: '[REQUEST MANAGER] Initializing...'
    });

    motherEmitter.on('httpRequest', (payload, originalCb) => {
      const callback = onceCallback(originalCb);
      (async () => {
        try {
          const { moduleName, moduleType, url, method = 'get', data, headers } = payload || {};
          if (!moduleName || !moduleType || !url) {
            throw new Error('Invalid payload.');
          }
          if (!allowedModules.includes(moduleName)) {
            throw new Error(`Module "${moduleName}" not allowed to make HTTP requests.`);
          }
          if (!/^https?:\/\//i.test(url)) {
            throw new Error('Invalid URL');
          }
          const resp = await axios({ method, url, data, headers, maxRedirects: 0 });
          callback(null, { status: resp.status, data: resp.data });
        } catch (err) {
          notificationEmitter.notify({
            moduleName: 'requestManager',
            notificationType: 'system',
            priority: 'warning',
            message: `[REQUEST MANAGER] Request error => ${err.message}`
          });
          callback(err);
        }
      })();
    });

    notificationEmitter.notify({
      moduleName: 'requestManager',
      notificationType: 'system',
      priority: 'info',
      message: '[REQUEST MANAGER] Ready.'
    });
  }
};