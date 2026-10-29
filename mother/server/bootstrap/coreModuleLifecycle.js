'use strict';

const { createCoreModuleScope, lifecycleError } = require('./coreModuleScope');
const { createCoreModuleHttpScope } = require('./coreModuleHttpScope');

/** Host-owned lifecycle; package trust must be checked before invoking replace. */
function createCoreModuleLifecycle(motherEmitter) {
  const modules = new Map();
  const busy = new Set();

  async function initialize(moduleName, implementation, context, deferred = false) {
    if (typeof implementation?.initialize !== 'function') throw lifecycleError('CORE_MODULE_ENTRY_INVALID', moduleName);
    const scope = createCoreModuleScope(motherEmitter, moduleName, { deferred });
    const http = implementation.httpLifecycleVersion === 1 ? createCoreModuleHttpScope(scope) : null;
    try {
      await implementation.initialize({ ...context, ...(http ? { app: http.app } : {}), motherEmitter: scope.emitter, lifecycle: scope, isModuleUpdate: deferred });
      if (!deferred) scope.activate();
      return { scope, implementation, context, http };
    } catch (error) {
      try { await scope.dispose(); } catch (cleanupError) {
        throw Object.assign(new AggregateError([error, cleanupError], `CORE_MODULE_INIT_CLEANUP_FAILED: ${moduleName}`), {
          code: 'CORE_MODULE_INIT_CLEANUP_FAILED'
        });
      }
      throw error;
    }
  }

  return {
    async start(moduleName, implementation, context) {
      if (modules.has(moduleName) || busy.has(moduleName)) throw lifecycleError('CORE_MODULE_ALREADY_STARTED', moduleName);
      if (implementation?.httpLifecycleVersion === 1 && typeof context.app?.use !== 'function') {
        throw lifecycleError('CORE_MODULE_HTTP_HOST_MISSING', moduleName);
      }
      busy.add(moduleName);
      try {
        const record = await initialize(moduleName, implementation, context);
        if (record.http) {
          context.app.use((req, res, next) => modules.get(moduleName).http.dispatch(req, res, next));
        }
        modules.set(moduleName, record);
      }
      finally { busy.delete(moduleName); }
    },
    async replace(moduleName, implementation, { healthCheck, beforeActivate = async () => {}, generation, browserDirectory, timeoutMs = 10000 } = {}) {
      const current = modules.get(moduleName);
      if (!current) throw lifecycleError('CORE_MODULE_NOT_STARTED', moduleName);
      if (current.recoveryRequired) throw lifecycleError('CORE_MODULE_RECOVERY_REQUIRED', moduleName);
      if (busy.has(moduleName)) throw lifecycleError('CORE_MODULE_UPDATE_BUSY', moduleName);
      // An explicit lifecycle declaration prevents treating ordinary modular
      // source layout as proof of restart-safe resource and schema ownership.
      if (current.implementation.lifecycleVersion !== 1 || implementation?.lifecycleVersion !== 1 || typeof healthCheck !== 'function') {
        throw lifecycleError('CORE_MODULE_RESTART_REQUIRED', moduleName);
      }
      busy.add(moduleName);
      let next;
      try {
        await current.scope.drain(timeoutMs);
        try {
          next = await initialize(moduleName, implementation, {
            ...current.context, moduleGeneration: generation || current.context.moduleGeneration,
            browserDirectory
          }, true);
          // A host-compatible replacement retains its registered event surface.
          // This also catches initializers that swallow a setup error.
          const previousEvents = current.scope.eventNames();
          const nextEvents = next.scope.eventNames();
          if (previousEvents.length !== nextEvents.length || previousEvents.some((event, index) => event !== nextEvents[index])) {
            throw lifecycleError('CORE_MODULE_EVENT_SURFACE_CHANGED', moduleName);
          }
          if (current.http?.signature() !== next.http?.signature()) throw lifecycleError('CORE_MODULE_HTTP_SURFACE_CHANGED', moduleName);
          await healthCheck(implementation, { ...next.context, motherEmitter: next.scope.emitter });
          // Persist the verified selection before exposing its listeners. A
          // crash after this point restarts into the same selected generation.
          await beforeActivate();
        } catch (error) {
          // Keep the old closures intact until readiness passes. A failed
          // candidate cannot require re-running old initialization/migrations.
          if (['CORE_MODULE_INIT_CLEANUP_FAILED', 'CORE_MODULE_COMMIT_UNCERTAIN'].includes(error.code)) {
            current.recoveryRequired = true;
            throw error;
          }
          if (next) {
            try { await next.scope.dispose(); } catch (cleanupError) {
              current.recoveryRequired = true;
              throw new AggregateError([error, cleanupError], `CORE_MODULE_RECOVERY_REQUIRED: ${moduleName}`);
            }
          }
          current.scope.activate();
          throw error;
        }
        // No await between removing the old gates and exposing the candidate.
        current.scope.suspend();
        next.scope.activate();
        modules.set(moduleName, next);
        try { await current.scope.dispose(); } catch (error) {
          next.recoveryRequired = true;
          throw new AggregateError([error], `CORE_MODULE_RECOVERY_REQUIRED: ${moduleName}`);
        }
        return { moduleName, status: 'active', restartedHost: false };
      } finally { busy.delete(moduleName); }
    },
    // Internal static-asset selection; filesystem paths never enter admin snapshots.
    browserSelection(moduleName) {
      const record = modules.get(moduleName);
      return record?.context.browserDirectory ? {
        generationId: record.context.moduleGeneration?.generationId,
        moduleDir: record.context.browserDirectory
      } : null;
    },
    snapshot: () => [...modules.entries()].map(([moduleName, record]) => ({
      ...record.scope.snapshot(), moduleName,
      generation: record.context.moduleGeneration || null,
      updateMode: record.implementation.lifecycleVersion === 1 ? 'module' : 'host',
      recoveryRequired: record.recoveryRequired === true,
      updating: busy.has(moduleName)
    }))
  };
}

module.exports = { createCoreModuleLifecycle };
