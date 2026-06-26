'use strict';

const axios = require('axios');
const { onceCallback } = require('../../emitters/motherEmitter');
const notificationEmitter = require('../../emitters/notificationEmitter');

const MODULE_NAME = 'requestManager';
const MODULE_TYPE = 'core';
const allowedModules = ['databaseManager', 'news'];
const SAFE_METHODS = new Set(['delete', 'get', 'head', 'patch', 'post', 'put']);

function getRegisteredModuleType(motherEmitter, moduleName) {
  if (!motherEmitter || !motherEmitter._moduleTypes || !moduleName) {
    return null;
  }
  return motherEmitter._moduleTypes[moduleName] || null;
}

function assertCoreHttpRequest(motherEmitter, payload = {}) {
  const { jwt, moduleName, moduleType } = payload;
  const registeredType = getRegisteredModuleType(motherEmitter, moduleName);

  if (!jwt) {
    throw new Error('requestManager.httpRequest requires a jwt.');
  }

  if (registeredType === 'community') {
    throw new Error(`Community module "${moduleName}" cannot use requestManager.httpRequest directly.`);
  }

  if (moduleType !== 'core') {
    throw new Error('requestManager.httpRequest is core-only.');
  }
}

function assertSafeRequestMethod(method) {
  const normalized = String(method || 'get').toLowerCase();
  if (!SAFE_METHODS.has(normalized)) {
    throw new Error(`Unsupported HTTP method "${method}".`);
  }
  return normalized;
}

function assertAllowedRequestUrl(url) {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('Invalid URL');
  }

  const allowedHosts = (process.env.REQUEST_MANAGER_ALLOWED_HOSTS || '')
    .split(',')
    .map(host => host.trim().toLowerCase())
    .filter(Boolean);

  if (!allowedHosts.length) {
    return;
  }

  const parsed = new URL(url);
  if (!allowedHosts.includes(parsed.host.toLowerCase())) {
    throw new Error(`Host "${parsed.host}" is not allowed for outbound requests.`);
  }
}

module.exports = {
  async initialize({ motherEmitter, isCore }) {
    if (!isCore) {
      throw new Error('[REQUEST MANAGER] Must be loaded as a core module.');
    }
    if (!motherEmitter) {
      throw new Error('[REQUEST MANAGER] motherEmitter missing.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    notificationEmitter.notify({
      moduleName: MODULE_NAME,
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
          assertCoreHttpRequest(motherEmitter, payload);
          if (!allowedModules.includes(moduleName)) {
            throw new Error(`Module "${moduleName}" not allowed to make HTTP requests.`);
          }
          const safeMethod = assertSafeRequestMethod(method);
          assertAllowedRequestUrl(url);
          const resp = await axios({ method: safeMethod, url, data, headers, maxRedirects: 0 });
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

module.exports._internals = {
  assertAllowedRequestUrl,
  assertCoreHttpRequest,
  assertSafeRequestMethod,
  getRegisteredModuleType
};
