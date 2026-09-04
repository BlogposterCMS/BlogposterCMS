'use strict';

const { BACKEND_EVENTS } = require('../../../contracts/generatedBackendEventCatalog');

const {
  resolveAdminDomain,
  resolvePublicDomain,
  isAppContextReadAction
} = require('./registry');

const APP_CONTEXT_CORE_OWNED_WRITE_BRIDGE_EVENTS = new Set([
  'cms-app-runtime-request',
  'cms-app-runtime-batch-request'
]);

function publicRuntimeParams(params = {}) {
  const source = params && typeof params === 'object' && !Array.isArray(params) ? params : {};
  const safe = { ...source };
  delete safe.jwt;
  delete safe.decodedJWT;
  delete safe.moduleName;
  delete safe.moduleType;
  return safe;
}

function isCoreOwnedWriteBridgeContext(appContext = {}) {
  return appContext?.coreOwned === true &&
    APP_CONTEXT_CORE_OWNED_WRITE_BRIDGE_EVENTS.has(String(appContext.event || ''));
}

function requireAppContextReadOnly(payload, resource, action) {
  if (!payload?.appContext) return;
  if (isAppContextReadAction(resource, action)) return;
  if (isCoreOwnedWriteBridgeContext(payload.appContext)) return;
  throw new Error(`Forbidden - apps can only query CMS admin API resources: ${resource}.${action}`);
}

function createFacadeDispatchers(runtime) {
  async function cmsPublicRuntimeRequest(motherEmitter, internalJwt, payload = {}) {
    runtime.assertRuntimePayload(payload, BACKEND_EVENTS.CMS_PUBLIC_RUNTIME_REQUEST);
    runtime.requirePublicRuntimePrincipal(payload);

    const resolved = resolvePublicDomain(payload.resource, payload.action);
    const { resource, action, definition, domain } = resolved;
    if (!definition) {
      throw new Error(`Unknown CMS public runtime action: ${payload.resource || ''}.${payload.action || ''}`);
    }

    const genericParams = publicRuntimeParams(payload.params);
    const params = domain.preparePublicParams
      ? domain.preparePublicParams({ resource, action, params: genericParams })
      : genericParams;
    const eventPayload = {
      ...params,
      jwt: internalJwt || payload.jwt,
      moduleName: definition.moduleName,
      moduleType: definition.moduleType || 'core'
    };

    if (domain.beforePublicDispatch) {
      await domain.beforePublicDispatch({
        motherEmitter,
        resource,
        action,
        params,
        eventPayload
      }, runtime);
    }

    const data = await runtime.requestEvent(motherEmitter, definition.eventName, eventPayload);
    return {
      resource,
      action,
      eventName: definition.eventName,
      data: domain.formatPublicData
        ? domain.formatPublicData({ resource, action, data }, runtime)
        : data
    };
  }

  async function cmsAdminApiRequest(motherEmitter, jwt, payload = {}) {
    runtime.assertRuntimePayload(payload, BACKEND_EVENTS.CMS_ADMIN_API_REQUEST);
    runtime.requireAdminPrincipal(payload);

    const { resource, action, definition } = resolveAdminDomain(payload.resource, payload.action);
    if (!definition) {
      throw new Error(`Unknown CMS admin API action: ${payload.resource || ''}.${payload.action || ''}`);
    }

    requireAppContextReadOnly(payload, resource, action);
    runtime.requirePayloadPermission(payload, definition.permission);

    const params = payload.params && typeof payload.params === 'object' && !Array.isArray(payload.params)
      ? payload.params
      : {};
    const eventPayload = {
      ...params,
      jwt,
      moduleName: definition.moduleName,
      moduleType: definition.moduleType || 'core',
      decodedJWT: payload.decodedJWT
    };
    if (definition.useActorUserId) {
      const userId = runtime.actorIdFromPayload(payload);
      if (!userId) {
        throw new Error('[runtimeManager:ACTOR_USER_ID_REQUIRED] Current-user admin action requires an authenticated user id.');
      }
      eventPayload.userId = userId;
    }

    const data = await runtime.requestEvent(motherEmitter, definition.eventName, eventPayload);
    return { resource, action, eventName: definition.eventName, data };
  }

  return Object.freeze({ cmsAdminApiRequest, cmsPublicRuntimeRequest });
}

module.exports = Object.freeze({
  createFacadeDispatchers,
  _internals: Object.freeze({
    isCoreOwnedWriteBridgeContext,
    publicRuntimeParams,
    requireAppContextReadOnly
  })
});
