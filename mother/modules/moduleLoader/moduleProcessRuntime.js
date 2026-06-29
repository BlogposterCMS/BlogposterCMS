'use strict';

const path = require('path');
const { fork } = require('child_process');
const {
  createCommunityHealthCheckHost,
  createCommunityModuleHost
} = require('./moduleHost');
const { buildModuleRuntimeEnv } = require('./moduleRuntimeEnv');
const { cloneRuntimeData } = require('./moduleRuntimeUtils');

const RUNNER_ENTRY = path.join(__dirname, 'moduleRunnerProcess.js');
const DEFAULT_INIT_TIMEOUT_MS = 10000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

function timeoutFromEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function serializeError(err, fallbackCode = 'E_MODULE_RUNNER_ERROR') {
  if (!err) return null;
  return {
    code: err.code || fallbackCode,
    message: err.message || String(err),
    stack: err.stack || ''
  };
}

function errorFromWire(error, fallbackCode = 'E_MODULE_RUNNER_ERROR') {
  const err = new Error(error?.message || String(error || fallbackCode));
  err.code = error?.code || fallbackCode;
  if (error?.stack) err.stack = error.stack;
  return err;
}

function toWireValue(value) {
  if (typeof value === 'function') {
    return { __bpFunctionRef: true };
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
    if (Array.isArray(value)) return value.map(fromWireValue);
    const obj = {};
    for (const [key, item] of Object.entries(value)) {
      obj[key] = fromWireValue(item);
    }
    return obj;
  }
  return value;
}

class CommunityModuleProcess {
  constructor({
    app,
    accessGrants = [],
    accessConsentManager = null,
    indexJsPath,
    jwt,
    moduleDir,
    moduleInfo = {},
    moduleName,
    motherEmitter,
    nonce,
    phase = 'runtime'
  }) {
    this.app = app;
    this.accessGrants = accessGrants;
    this.accessConsentManager = accessConsentManager;
    this.indexJsPath = path.resolve(indexJsPath);
    this.jwt = jwt;
    this.moduleDir = path.resolve(moduleDir);
    this.moduleInfo = moduleInfo || {};
    this.moduleName = moduleName;
    this.motherEmitter = motherEmitter;
    this.nonce = nonce;
    this.phase = phase;
    this.child = null;
    this.nextMessageId = 1;
    this.nextCallbackId = 1;
    this.pendingResponses = new Map();
    this.pendingHostCallbacks = new Map();
    this.remoteListeners = new Map();
    this.staticMounts = [];
    this.boundaryTouched = false;
    this.stopped = false;
    this.exitPromise = null;
    this.initTimeoutMs = timeoutFromEnv('MODULE_RUNNER_INIT_TIMEOUT_MS', DEFAULT_INIT_TIMEOUT_MS);
    this.requestTimeoutMs = timeoutFromEnv('MODULE_RUNNER_REQUEST_TIMEOUT_MS', DEFAULT_REQUEST_TIMEOUT_MS);
  }

  get capabilities() {
    return {
      events: true,
      moduleStorage: true,
      staticAssets: true,
      rawExpressApp: false,
      rawSql: false,
      systemWrites: false,
      processIsolated: true
    };
  }

  getRuntimeRecord() {
    return {
      moduleName: this.moduleName,
      moduleType: 'community',
      runtime: 'process',
      processId: this.child?.pid || null,
      capabilities: this.capabilities,
      stop: () => this.stop('[E_MODULE_RUNNER_STOP] Runtime stopped by host.')
    };
  }

  async initialize() {
    this.startChild();
    const response = await this.sendRunnerRequest('initialize', {
      apiVersion: 1,
      indexJsPath: this.indexJsPath,
      moduleDir: this.moduleDir,
      moduleInfo: this.moduleInfo,
      moduleName: this.moduleName,
      phase: this.phase
    }, this.initTimeoutMs);

    if (this.phase === 'healthcheck' && !this.boundaryTouched) {
      throw new Error(`[E_MODULE_HEALTHCHECK_NO_BOUNDARY] Module "${this.moduleName}" did not use the moduleHost or event bus during health check.`);
    }

    return response;
  }

  startChild() {
    if (this.child) return;

    const env = buildModuleRuntimeEnv(this.moduleDir);
    const child = fork(RUNNER_ENTRY, [], {
      cwd: this.moduleDir,
      env,
      execArgv: [],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });

    this.child = child;
    child.stdout?.on('data', chunk => {
      process.stdout.write(`[MODULE RUNNER:${this.moduleName}] ${chunk}`);
    });
    child.stderr?.on('data', chunk => {
      process.stderr.write(`[MODULE RUNNER:${this.moduleName}:ERR] ${chunk}`);
    });
    this.exitPromise = new Promise(resolve => {
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    child.on('message', message => this.handleRunnerMessage(message));
    child.on('exit', (code, signal) => this.handleExit(code, signal));
    child.on('error', err => this.rejectAll(err, 'E_MODULE_RUNNER_PROCESS_ERROR'));
  }

  async stop(reason = '[E_MODULE_RUNNER_STOP] Runtime stopped.') {
    this.stopped = true;
    for (const { eventName, handler } of this.remoteListeners.values()) {
      try {
        this.getHost().eventBus.off(eventName, handler);
      } catch {
        // The caller may already have removed listeners during module cleanup.
      }
    }
    this.remoteListeners.clear();
    this.pendingHostCallbacks.clear();

    if (this.child && !this.child.killed) {
      let killTimer = null;
      try {
        this.child.send({ bpModuleRunner: true, type: 'event', action: 'shutdown', payload: { reason } });
      } catch {
        // The process may have already disconnected.
      }
      killTimer = setTimeout(() => {
        if (this.child && !this.child.killed) {
          this.child.kill();
        }
      }, 250);
      killTimer.unref?.();

      if (this.exitPromise) {
        await this.exitPromise.finally(() => {
          if (killTimer) clearTimeout(killTimer);
        });
      }
    }
  }

  sendRunnerRequest(action, payload = {}, timeoutMs = this.requestTimeoutMs) {
    if (!this.child || !this.child.connected) {
      return Promise.reject(new Error(`[E_MODULE_RUNNER_NOT_CONNECTED] Runner for "${this.moduleName}" is not connected.`));
    }

    const id = `host-${this.nextMessageId++}`;
    const message = {
      bpModuleRunner: true,
      type: 'request',
      id,
      action,
      payload
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResponses.delete(id);
        reject(new Error(`[E_MODULE_RUNNER_TIMEOUT] Runner request "${action}" timed out for module "${this.moduleName}".`));
      }, timeoutMs);
      timer.unref?.();
      this.pendingResponses.set(id, { resolve, reject, timer });

      try {
        this.child.send(message);
      } catch (err) {
        clearTimeout(timer);
        this.pendingResponses.delete(id);
        reject(err);
      }
    });
  }

  sendRunnerEvent(action, payload = {}) {
    if (!this.child || !this.child.connected) return false;
    try {
      this.child.send({
        bpModuleRunner: true,
        type: 'event',
        action,
        payload
      });
      return true;
    } catch {
      return false;
    }
  }

  handleRunnerMessage(message) {
    if (!message || message.bpModuleRunner !== true) return;

    if (message.type === 'response') {
      const pending = this.pendingResponses.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pendingResponses.delete(message.id);
      if (message.error) {
        pending.reject(errorFromWire(message.error, 'E_MODULE_RUNNER_RESPONSE_ERROR'));
      } else {
        pending.resolve(fromWireValue(message.payload));
      }
      return;
    }

    if (message.type === 'request') {
      this.handleHostRequest(message).catch(err => {
        this.sendHostResponse(message.id, null, err);
      });
      return;
    }

    if (message.type === 'event' && message.action === 'fatal') {
      const err = errorFromWire(message.payload?.error, 'E_MODULE_RUNNER_FATAL');
      this.rejectAll(err, err.code);
    }
  }

  sendHostResponse(id, payload, err) {
    if (!this.child || !this.child.connected || !id) return;
    this.child.send({
      bpModuleRunner: true,
      type: 'response',
      id,
      payload: err ? undefined : toWireValue(payload),
      error: err ? serializeError(err, 'E_MODULE_RUNNER_HOST_REQUEST_FAILED') : null
    });
  }

  async handleHostRequest(message) {
    const { action } = message;
    const payload = fromWireValue(message.payload || {});
    let result;

    if (action === 'event.emit') {
      result = await this.handleEmit(payload);
    } else if (action === 'event.on' || action === 'event.once') {
      result = this.handleListenerRegistration(action, payload);
    } else if (action === 'event.off') {
      result = this.handleListenerRemoval(payload);
    } else if (action === 'event.listenerCount') {
      result = this.getHost().eventBus.listenerCount(payload.eventName);
    } else if (action === 'host.registerStaticAssets') {
      this.boundaryTouched = true;
      const mount = await this.getHost().registerStaticAssets(payload.options || {});
      if (this.phase === 'runtime') this.staticMounts.push(mount);
      result = mount;
    } else if (action === 'host.getStaticMounts') {
      result = this.getHost().getStaticMounts();
    } else if (action.startsWith('host.storage.')) {
      this.boundaryTouched = true;
      result = await this.handleStorageRequest(action, payload);
    } else if (action === 'listener.callback') {
      result = this.handleListenerCallback(payload);
    } else {
      const err = new Error(`[E_MODULE_RUNNER_UNKNOWN_ACTION] Unknown module runner action "${action}".`);
      err.code = 'E_MODULE_RUNNER_UNKNOWN_ACTION';
      throw err;
    }

    this.sendHostResponse(message.id, result, null);
  }

  async handleEmit(payload = {}) {
    this.boundaryTouched = true;
    const { eventName, eventPayload = {}, hasCallback = false } = payload;
    const host = this.getHost();

    if (!hasCallback) {
      return {
        emitted: Boolean(await host.eventBus.emit(eventName, eventPayload))
      };
    }

    return await new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`[E_MODULE_RUNNER_EVENT_CALLBACK_TIMEOUT] Event "${eventName}" did not call back for module "${this.moduleName}".`));
      }, this.requestTimeoutMs);
      timer.unref?.();

      Promise.resolve(host.eventBus.emit(eventName, eventPayload, (...callbackArgs) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          emitted: true,
          callbackArgs: callbackArgs.map(toWireValue)
        });
      })).then(emitted => {
        if (emitted === false && !settled) {
          settled = true;
          clearTimeout(timer);
          resolve({
            emitted: false,
            callbackArgs: [
              toWireValue({
                code: 'E_MODULE_RUNNER_EVENT_NOT_HANDLED',
                message: `Event "${eventName}" was not handled.`
              })
            ]
          });
        }
      }).catch(err => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  handleListenerRegistration(action, payload = {}) {
    this.boundaryTouched = true;
    const { eventName, listenerId } = payload;
    if (!listenerId) {
      throw new Error('[E_MODULE_RUNNER_LISTENER_ID_MISSING] Runner listener registration requires listenerId.');
    }

    const handler = (...args) => {
      const callbackArgs = args.map(arg => {
        if (typeof arg !== 'function') return toWireValue(arg);
        const callbackId = `cb-${this.nextCallbackId++}`;
        this.pendingHostCallbacks.set(callbackId, arg);
        return { __bpFunctionRef: true, callbackId };
      });

      this.sendRunnerEvent('listener.dispatch', {
        listenerId,
        args: callbackArgs
      });
    };

    if (action === 'event.once') {
      this.getHost().eventBus.once(eventName, handler);
    } else {
      this.getHost().eventBus.on(eventName, handler);
    }
    this.remoteListeners.set(listenerId, { eventName, handler });
    return { registered: true };
  }

  handleListenerRemoval(payload = {}) {
    this.boundaryTouched = true;
    const { eventName, listenerId } = payload;
    const record = this.remoteListeners.get(listenerId);
    if (!record) return { removed: false };
    this.getHost().eventBus.off(eventName || record.eventName, record.handler);
    this.remoteListeners.delete(listenerId);
    return { removed: true };
  }

  handleListenerCallback(payload = {}) {
    const callback = this.pendingHostCallbacks.get(payload.callbackId);
    if (!callback) return { called: false };
    callback(...(payload.args || []).map(fromWireValue));
    return { called: true };
  }

  async handleStorageRequest(action, payload = {}) {
    const operation = action.slice('host.storage.'.length);
    const storage = this.getHost().storage;

    if (operation === 'select') {
      return await storage.select(payload.table, payload.options || {});
    }
    if (operation === 'insert') {
      return await storage.insert(payload.table, payload.data || {});
    }
    if (operation === 'update') {
      return await storage.update(payload.table, payload.where || {}, payload.data);
    }
    if (operation === 'delete') {
      return await storage.delete(payload.table, payload.where || {});
    }

    const err = new Error(`[E_MODULE_RUNNER_STORAGE_ACTION] Unknown storage action "${action}".`);
    err.code = 'E_MODULE_RUNNER_STORAGE_ACTION';
    throw err;
  }

  getHost() {
    if (this.host) return this.host;
    const factory = this.phase === 'healthcheck'
      ? createCommunityHealthCheckHost
      : createCommunityModuleHost;

    this.host = factory({
      app: this.app,
      motherEmitter: this.motherEmitter,
      moduleName: this.moduleName,
      moduleInfo: this.moduleInfo,
      moduleDir: this.moduleDir,
      jwt: this.jwt,
      nonce: this.nonce,
      accessGrants: this.accessGrants,
      accessConsentManager: this.phase === 'runtime' ? this.accessConsentManager : null,
      markEvent: () => {
        this.boundaryTouched = true;
      }
    });
    return this.host;
  }

  handleExit(code, signal) {
    if (this.stopped) return;
    const reason = signal || code;
    const err = new Error(`[E_MODULE_RUNNER_EXITED] Runner for "${this.moduleName}" exited with ${reason}.`);
    err.code = 'E_MODULE_RUNNER_EXITED';
    this.rejectAll(err, err.code);
  }

  rejectAll(err, fallbackCode) {
    for (const [id, pending] of this.pendingResponses.entries()) {
      clearTimeout(pending.timer);
      pending.reject(errorFromWire(serializeError(err, fallbackCode), fallbackCode));
      this.pendingResponses.delete(id);
    }
  }
}

async function startCommunityModuleProcess(options) {
  const controller = new CommunityModuleProcess(options);
  await controller.initialize();
  return controller;
}

async function runCommunityModuleHealthCheck(options) {
  const controller = new CommunityModuleProcess({
    ...options,
    phase: 'healthcheck'
  });
  try {
    await controller.initialize();
  } finally {
    await controller.stop('[E_MODULE_HEALTHCHECK_DONE] Health check process finished.');
  }
  return true;
}

module.exports = {
  CommunityModuleProcess,
  cloneRuntimeData,
  runCommunityModuleHealthCheck,
  startCommunityModuleProcess,
  _internals: {
    errorFromWire,
    fromWireValue,
    serializeError,
    toWireValue
  }
};
