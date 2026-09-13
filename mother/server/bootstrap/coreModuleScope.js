'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

function lifecycleError(code, moduleName) {
  return Object.assign(new Error(`${code}: ${moduleName}`), { code, moduleName,
    ...(code === 'CORE_MODULE_UPDATING' ? { status: 503 } : {}) });
}

/** Own registrations without replacing the authenticated MotherEmitter. */
function createCoreModuleScope(motherEmitter, moduleName, {
  deferred = false,
  credentialProvider = null,
  capturedTokens = []
} = {}) {
  const registrations = [];
  const pending = new Set();
  const cleanups = [];
  const intervals = [];
  const continuations = new AsyncLocalStorage();
  let state = deferred ? 'preparing' : 'initializing';
  let facade;
  const ownedTokens = new Set(capturedTokens.filter(token => typeof token === 'string' && token));

  function reportDeferredCallbackError() {
    // A callback throw cannot propagate to the original emit frame after an
    // asynchronous renewal. Keep it handled without logging credentials or
    // provider error details.
    console.error('[CORE_MODULE_DEFERRED_CALLBACK_FAILED]', moduleName);
  }

  function reportDeferredDispatchError() {
    console.warn('[CORE_MODULE_DEFERRED_DISPATCH_FAILED]', moduleName);
  }

  function refreshedPayload(payload, token) {
    if (!payload || typeof payload !== 'object') return payload;
    let changed = false;
    const next = { ...payload };
    for (const key of ['jwt', 'jwtToken']) {
      if (ownedTokens.has(payload[key])) {
        next[key] = token;
        changed = true;
      }
    }
    return changed ? next : payload;
  }

  function emitWithCurrentCredential(args) {
    const payload = args[1];
    const hasOwnedCredential = payload && typeof payload === 'object' &&
      ['jwt', 'jwtToken'].some(key => ownedTokens.has(payload[key]));
    if (!credentialProvider || !hasOwnedCredential) return motherEmitter.emit(...args);

    const currentToken = credentialProvider.currentToken();
    if (currentToken) {
      const dispatched = [...args];
      dispatched[1] = refreshedPayload(payload, currentToken);
      return motherEmitter.emit(...dispatched);
    }

    const callbackIndex = args.findIndex(value => typeof value === 'function');
    const callback = callbackIndex >= 0 ? args[callbackIndex] : null;
    const operation = { kind: 'credential-renewal', cancelled: false, finished: false };
    const finish = () => {
      if (operation.finished) return;
      operation.finished = true;
      pending.delete(operation);
    };
    const reply = (...values) => {
      try { return callback?.(...values); }
      catch { reportDeferredCallbackError(); }
    };
    const fail = error => {
      if (operation.finished) return;
      if (!callback) reportDeferredDispatchError();
      try { reply(error); } finally { finish(); }
    };
    operation.cancel = () => {
      operation.cancelled = true;
      fail(lifecycleError('CORE_MODULE_SCOPE_CLOSED', moduleName));
    };
    pending.add(operation);
    Promise.resolve().then(() => credentialProvider.getToken()).then(token => {
      if (operation.cancelled || state === 'disposed' || state === 'suspended') {
        operation.cancel();
        return;
      }
      const dispatched = [...args];
      dispatched[1] = refreshedPayload(payload, token);
      if (callbackIndex >= 0) {
        dispatched[callbackIndex] = (...values) => {
          if (operation.finished) return;
          try { return reply(...values); } finally { finish(); }
        };
      }
      try {
        operation.kind = 'credential-dispatch';
        const emitted = motherEmitter.emit(...dispatched);
        if (emitted === false && !operation.finished) {
          fail(lifecycleError('CORE_MODULE_DISPATCH_REJECTED', moduleName));
        } else if (callbackIndex < 0) {
          finish();
        }
      } catch (error) {
        fail(error);
      }
    }, fail).catch(() => {
      // Every expected branch is handled above. This final guard prevents a
      // deferred callback implementation from creating an unhandled rejection.
      reportDeferredCallbackError();
      finish();
    });
    // Deferred dispatch is accepted into the lifecycle even though MotherEmitter
    // will perform the authoritative authentication after renewal completes.
    return true;
  }

  function stopIntervals() {
    for (const interval of intervals) {
      clearInterval(interval.timer);
      interval.timer = null;
    }
  }

  function startIntervals() {
    for (const interval of intervals) {
      if (interval.timer) continue;
      const tick = async () => {
        if (state !== 'active' || interval.running) return;
        interval.running = true;
        const work = {};
        pending.add(work);
        try { await continuations.run(work, interval.run); }
        catch (error) { interval.onError(error); }
        finally { interval.running = false; pending.delete(work); }
      };
      interval.timer = setInterval(tick, interval.intervalMs);
      interval.timer.unref?.();
      if (interval.immediate) void tick();
    }
  }

  function register(event, listener, once = false, prepend = false) {
    if (!['active', 'initializing', 'preparing'].includes(state)) {
      throw lifecycleError('CORE_MODULE_SCOPE_CLOSED', moduleName);
    }
    if (typeof listener !== 'function') throw lifecycleError('CORE_MODULE_LISTENER_INVALID', moduleName);
    const registration = { event, listener, wrapped: null };
    registration.wrapped = function (...args) {
      const callbackIndex = args.findIndex(value => typeof value === 'function');
      const continuing = state === 'draining' && pending.has(continuations.getStore());
      if (state !== 'active' && state !== 'initializing' && !continuing) {
        if (callbackIndex >= 0) args[callbackIndex](lifecycleError('CORE_MODULE_UPDATING', moduleName));
        return;
      }
      if (once) remove(event, listener);
      // A callback may outlive a synchronous handler, and an async handler may
      // continue after replying. Both must finish before its code is retired.
      const operation = {};
      pending.add(operation);
      let returned = false;
      let replied = callbackIndex < 0;
      const finish = () => { if (returned && replied) pending.delete(operation); };
      if (callbackIndex >= 0) {
        const callback = args[callbackIndex];
        args[callbackIndex] = (...values) => {
          if (replied) return;
          replied = true;
          try { return callback(...values); } finally { finish(); }
        };
      }
      try {
        const result = continuations.run(operation, () => listener.apply(facade, args));
        if (result && typeof result.then === 'function') {
          return Promise.resolve(result).then(value => {
            returned = true; finish(); return value;
          }, error => {
            returned = true;
            if (callbackIndex >= 0 && !replied) args[callbackIndex](error);
            else { replied = true; finish(); throw error; }
          });
        }
        returned = true; finish();
        return result;
      } catch (error) {
        returned = true; replied = true; finish(); throw error;
      }
    };
    registration.wrapped.moduleName = moduleName;
    registrations.push(registration);
    registration.prepend = prepend;
    if (state !== 'preparing') motherEmitter[prepend ? 'prependListener' : 'on'](event, registration.wrapped);
    return facade;
  }

  function remove(event, listener) {
    // EventEmitter removes the most recently registered matching listener.
    for (let index = registrations.length - 1; index >= 0; index -= 1) {
      const record = registrations[index];
      if (record.event === event && (record.listener === listener || record.wrapped === listener)) {
        motherEmitter.removeListener(event, record.wrapped);
        registrations.splice(index, 1);
        break;
      }
    }
    return facade;
  }

  const methods = {
    emit: (...args) => {
      if (state === 'disposed' || state === 'suspended') throw lifecycleError('CORE_MODULE_SCOPE_CLOSED', moduleName);
      return emitWithCurrentCredential(args);
    },
    on: (event, listener) => register(event, listener),
    addListener: (event, listener) => register(event, listener),
    once: (event, listener) => register(event, listener, true),
    prependListener: (event, listener) => register(event, listener, false, true),
    prependOnceListener: (event, listener) => register(event, listener, true, true),
    removeListener: remove,
    off: remove,
    removeAllListeners: event => {
      for (const record of [...registrations]) {
        if (event === undefined || record.event === event) remove(record.event, record.wrapped);
      }
      return facade;
    }
  };
  facade = new Proxy(motherEmitter, {
    get(target, key) {
      if (Object.prototype.hasOwnProperty.call(methods, key)) return methods[key];
      const value = Reflect.get(target, key, target);
      // Emission still passes through the original JWT/permission boundary.
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });

  return {
    emitter: facade,
    every(intervalMs, run, { immediate = false, onError = () => console.warn('CORE_MODULE_BACKGROUND_FAILED', moduleName) } = {}) {
      if (!['initializing', 'preparing'].includes(state) || !Number.isFinite(intervalMs) || intervalMs < 1 ||
          typeof run !== 'function' || typeof onError !== 'function') throw lifecycleError('CORE_MODULE_INTERVAL_INVALID', moduleName);
      // Candidates own definitions, not running timers. Draining stops new ticks
      // and awaits in-flight work; restoring the old generation restarts its timer.
      const interval = { intervalMs, run, immediate, onError, timer: null, running: false };
      intervals.push(interval);
      return () => {
        clearInterval(interval.timer);
        interval.timer = null;
        const index = intervals.indexOf(interval);
        if (index >= 0) intervals.splice(index, 1);
      };
    },
    beginWork({ continuation = false } = {}) {
      if (!['active', 'initializing'].includes(state) && !(continuation && state === 'draining')) throw lifecycleError('CORE_MODULE_UPDATING', moduleName);
      const operation = {};
      pending.add(operation);
      const finish = () => pending.delete(operation);
      // HTTP handlers can keep their admitted async chain while new requests
      // are gated. A detached continuation loses admission after work finishes.
      finish.run = callback => continuations.run(operation, callback);
      return finish;
    },
    activate() {
      if (state === 'disposed') throw lifecycleError('CORE_MODULE_SCOPE_CLOSED', moduleName);
      if (state === 'preparing') {
        for (const record of registrations) motherEmitter[record.prepend ? 'prependListener' : 'on'](record.event, record.wrapped);
      }
      state = 'active';
      startIntervals();
    },
    suspend() {
      if (state !== 'draining' || pending.size) throw lifecycleError('CORE_MODULE_STILL_BUSY', moduleName);
      for (const record of registrations) motherEmitter.removeListener(record.event, record.wrapped);
      state = 'suspended';
    },
    resume() {
      if (state !== 'suspended') throw lifecycleError('CORE_MODULE_RESUME_INVALID', moduleName);
      for (const record of registrations) motherEmitter.on(record.event, record.wrapped);
      state = 'active';
      startIntervals();
    },
    onCleanup(cleanup) {
      if (typeof cleanup !== 'function' || state === 'disposed') throw lifecycleError('CORE_MODULE_CLEANUP_INVALID', moduleName);
      cleanups.push(cleanup);
    },
    async drain(timeoutMs = 10000) {
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw lifecycleError('CORE_MODULE_DRAIN_TIMEOUT_INVALID', moduleName);
      state = 'draining';
      stopIntervals();
      const deadline = Date.now() + timeoutMs;
      while (pending.size) {
        if (Date.now() >= deadline) {
          state = 'active';
          startIntervals();
          throw lifecycleError('CORE_MODULE_DRAIN_TIMEOUT', moduleName);
        }
        await new Promise(resolve => setTimeout(resolve, Math.min(10, timeoutMs)));
      }
    },
    async dispose() {
      const renewalOperations = [...pending].filter(operation => operation.kind === 'credential-renewal');
      if (pending.size !== renewalOperations.length) throw lifecycleError('CORE_MODULE_STILL_BUSY', moduleName);
      state = 'disposed';
      for (const operation of renewalOperations) {
        operation.cancel();
      }
      stopIntervals();
      methods.removeAllListeners();
      const errors = [];
      for (const cleanup of cleanups.splice(0).reverse()) {
        try { await cleanup(); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, `CORE_MODULE_CLEANUP_FAILED: ${moduleName}`);
    },
    eventNames: () => registrations.map(record => record.event).sort(),
    snapshot: () => ({ moduleName, state, pending: pending.size, listeners: registrations.length })
  };
}

module.exports = { createCoreModuleScope, lifecycleError };
