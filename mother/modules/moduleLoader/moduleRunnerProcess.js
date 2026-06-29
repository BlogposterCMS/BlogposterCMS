'use strict';

const path = require('path');

let nextMessageId = 1;
let nextListenerId = 1;
const pendingResponses = new Map();
const pendingHostRequests = new Set();
const listeners = new Map();

function serializeError(err, fallbackCode = 'E_MODULE_RUNNER_CHILD_ERROR') {
  if (!err) return null;
  return {
    code: err.code || fallbackCode,
    message: err.message || String(err),
    stack: err.stack || ''
  };
}

function errorFromWire(error, fallbackCode = 'E_MODULE_RUNNER_HOST_ERROR') {
  const err = new Error(error?.message || String(error || fallbackCode));
  err.code = error?.code || fallbackCode;
  if (error?.stack) err.stack = error.stack;
  return err;
}

function toWireValue(value) {
  if (value instanceof Error) {
    return { __bpError: true, error: serializeError(value) };
  }
  if (value === undefined) {
    return { __bpUndefined: true };
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toWireValue);
  }
  const obj = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'function') {
      obj[key] = toWireValue(item);
    }
  }
  return obj;
}

function fromWireValue(value) {
  if (value && typeof value === 'object') {
    if (value.__bpUndefined) return undefined;
    if (value.__bpError) return errorFromWire(value.error, 'E_MODULE_RUNNER_REMOTE_ERROR');
    if (value.__bpFunctionRef && value.callbackId) {
      return (...args) => {
        trackHostRequest(sendHostRequest('listener.callback', {
          callbackId: value.callbackId,
          args: args.map(toWireValue)
        })).catch(err => {
          sendFatal(err);
        });
      };
    }
    if (Array.isArray(value)) return value.map(fromWireValue);
    const obj = {};
    for (const [key, item] of Object.entries(value)) {
      obj[key] = fromWireValue(item);
    }
    return obj;
  }
  return value;
}

function sendMessage(message) {
  if (typeof process.send === 'function') {
    process.send({
      bpModuleRunner: true,
      ...message
    });
  }
}

function sendResponse(id, payload, err) {
  sendMessage({
    type: 'response',
    id,
    payload: err ? undefined : toWireValue(payload),
    error: err ? serializeError(err) : null
  });
}

function sendHostRequest(action, payload = {}) {
  const id = `runner-${nextMessageId++}`;
  sendMessage({
    type: 'request',
    id,
    action,
    payload: toWireValue(payload)
  });

  return new Promise((resolve, reject) => {
    pendingResponses.set(id, { resolve, reject });
  });
}

function trackHostRequest(promise) {
  pendingHostRequests.add(promise);
  promise.finally(() => pendingHostRequests.delete(promise));
  return promise;
}

async function drainHostRequests() {
  while (pendingHostRequests.size) {
    await Promise.all(Array.from(pendingHostRequests));
  }
}

function sendFatal(err) {
  sendMessage({
    type: 'event',
    action: 'fatal',
    payload: {
      error: serializeError(err, 'E_MODULE_RUNNER_FATAL')
    }
  });
}

function assertInside(baseDir, candidatePath, label = 'path') {
  const root = path.resolve(baseDir);
  const resolved = path.resolve(candidatePath);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  const compareRoot = process.platform === 'win32' ? root.toLowerCase() : root;
  const compareResolved = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const compareRootPrefix = process.platform === 'win32' ? rootPrefix.toLowerCase() : rootPrefix;
  if (compareResolved !== compareRoot && !compareResolved.startsWith(compareRootPrefix)) {
    throw new Error(`[E_MODULE_RUNNER_PATH_ESCAPE] ${label} must stay inside the module folder.`);
  }
  return resolved;
}

function createDeniedAppFacade(moduleName) {
  const message = `[E_MODULE_RUNNER_RAW_APP_DENIED] Community module "${moduleName}" cannot access the raw Express app. Use moduleHost.registerStaticAssets() or a core API contract.`;
  const methods = [
    'all',
    'delete',
    'disable',
    'enable',
    'engine',
    'get',
    'head',
    'listen',
    'options',
    'patch',
    'post',
    'put',
    'route',
    'set',
    'use'
  ];
  return Object.freeze(Object.fromEntries(methods.map(method => [method, () => {
    throw new Error(message);
  }])));
}

function createEventBus() {
  return Object.freeze({
    emit(eventName, payload, callback) {
      let finalPayload = payload;
      let finalCallback = callback;
      if (typeof payload === 'function') {
        finalCallback = payload;
        finalPayload = {};
      }

      const request = trackHostRequest(sendHostRequest('event.emit', {
        eventName,
        eventPayload: finalPayload || {},
        hasCallback: typeof finalCallback === 'function'
      }));

      request.then(result => {
        if (typeof finalCallback === 'function') {
          finalCallback(...(result?.callbackArgs || []).map(fromWireValue));
        }
      }).catch(err => {
        if (typeof finalCallback === 'function') {
          finalCallback(err);
          return;
        }
        sendFatal(err);
      });

      return request;
    },

    on(eventName, handler) {
      if (typeof handler !== 'function') {
        throw new Error(`[E_MODULE_RUNNER_LISTENER_INVALID] Listener for "${eventName}" must be a function.`);
      }
      const listenerId = `listener-${nextListenerId++}`;
      listeners.set(listenerId, handler);
      trackHostRequest(sendHostRequest('event.on', { eventName, listenerId })).catch(sendFatal);
      return undefined;
    },

    once(eventName, handler) {
      if (typeof handler !== 'function') {
        throw new Error(`[E_MODULE_RUNNER_LISTENER_INVALID] Listener for "${eventName}" must be a function.`);
      }
      const listenerId = `listener-${nextListenerId++}`;
      listeners.set(listenerId, handler);
      trackHostRequest(sendHostRequest('event.once', { eventName, listenerId })).catch(sendFatal);
      return undefined;
    },

    off(eventName, handler) {
      for (const [listenerId, registeredHandler] of listeners.entries()) {
        if (registeredHandler === handler) {
          listeners.delete(listenerId);
          trackHostRequest(sendHostRequest('event.off', { eventName, listenerId })).catch(sendFatal);
          break;
        }
      }
      return this;
    },

    removeListener(eventName, handler) {
      return this.off(eventName, handler);
    },

    listenerCount(eventName) {
      return trackHostRequest(sendHostRequest('event.listenerCount', { eventName }));
    },

    registerModuleType() {
      return undefined;
    }
  });
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function createStorageFacade() {
  function sendStorageRequest(operation, payload = {}) {
    return trackHostRequest(sendHostRequest(`host.storage.${operation}`, payload));
  }

  return Object.freeze({
    select(table, options = {}) {
      return sendStorageRequest('select', { table, options });
    },

    insert(table, data = {}) {
      return sendStorageRequest('insert', { table, data });
    },

    update(table, where = {}, data) {
      if (data === undefined && isPlainObject(where) && ('where' in where || 'data' in where)) {
        return sendStorageRequest('update', {
          table,
          where: where.where || {},
          data: where.data
        });
      }
      return sendStorageRequest('update', { table, where, data });
    },

    delete(table, where = {}) {
      const finalWhere = isPlainObject(where) && 'where' in where ? where.where : where;
      return sendStorageRequest('delete', { table, where: finalWhere });
    }
  });
}

function createModuleHost({ moduleInfo, moduleName }) {
  const eventBus = createEventBus();
  const storage = createStorageFacade();
  return Object.freeze({
    apiVersion: 1,
    moduleName,
    moduleType: 'community',
    moduleInfo: Object.freeze({ ...(moduleInfo || {}) }),
    capabilities: Object.freeze({
      events: true,
      moduleStorage: true,
      staticAssets: true,
      rawExpressApp: false,
      rawSql: false,
      systemWrites: false,
      processIsolated: true
    }),
    events: eventBus,
    eventBus,
    storage,
    registerStaticAssets(options = {}) {
      return trackHostRequest(sendHostRequest('host.registerStaticAssets', { options }));
    },
    getStaticMounts() {
      return trackHostRequest(sendHostRequest('host.getStaticMounts'));
    }
  });
}

async function initializeModule(payload = {}) {
  const moduleName = String(payload.moduleName || '').trim();
  const moduleDir = path.resolve(payload.moduleDir || process.cwd());
  const indexJsPath = assertInside(moduleDir, payload.indexJsPath || path.join(moduleDir, 'index.js'), 'module entry');

  // The runner process is the isolation boundary. It deliberately uses normal
  // Node loading so the future Go host can keep the same process protocol.
  delete require.cache[require.resolve(indexJsPath)];
  const modEntry = require(indexJsPath);
  if (!modEntry || typeof modEntry.initialize !== 'function') {
    throw new Error(`[E_MODULE_RUNNER_INITIALIZE_MISSING] Module "${moduleName}" has no initialize() function.`);
  }

  const moduleHost = createModuleHost({
    moduleInfo: payload.moduleInfo || {},
    moduleName
  });
  await modEntry.initialize({
    motherEmitter: moduleHost.eventBus,
    eventBus: moduleHost.eventBus,
    moduleHost,
    app: createDeniedAppFacade(moduleName),
    isCore: false,
    moduleInfo: payload.moduleInfo || {}
  });
  await drainHostRequests();
  return {
    moduleName,
    runtime: 'process',
    exports: Object.keys(modEntry).filter(key => typeof modEntry[key] === 'function')
  };
}

async function handleRequest(message) {
  try {
    if (message.action === 'initialize') {
      const result = await initializeModule(fromWireValue(message.payload || {}));
      sendResponse(message.id, result, null);
      return;
    }

    throw new Error(`[E_MODULE_RUNNER_UNKNOWN_ACTION] Unknown runner action "${message.action}".`);
  } catch (err) {
    sendResponse(message.id, null, err);
  }
}

function handleEvent(message) {
  if (message.action === 'listener.dispatch') {
    const listenerId = message.payload?.listenerId;
    const handler = listeners.get(listenerId);
    if (!handler) return;

    try {
      const args = (message.payload?.args || []).map(fromWireValue);
      Promise.resolve(handler(...args)).catch(sendFatal);
    } catch (err) {
      sendFatal(err);
    }
    return;
  }

  if (message.action === 'shutdown') {
    process.exit(0);
  }
}

process.on('message', message => {
  if (!message || message.bpModuleRunner !== true) return;

  if (message.type === 'response') {
    const pending = pendingResponses.get(message.id);
    if (!pending) return;
    pendingResponses.delete(message.id);
    if (message.error) {
      pending.reject(errorFromWire(message.error));
    } else {
      pending.resolve(fromWireValue(message.payload));
    }
    return;
  }

  if (message.type === 'request') {
    handleRequest(message);
    return;
  }

  if (message.type === 'event') {
    handleEvent(message);
  }
});

process.on('uncaughtException', err => {
  sendFatal(err);
  process.exit(1);
});

process.on('unhandledRejection', err => {
  sendFatal(err);
  process.exit(1);
});
