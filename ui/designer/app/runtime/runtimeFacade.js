const RUNTIME_MANAGER_MODULE = Object.freeze({
  moduleName: 'runtimeManager',
  moduleType: 'core'
});

function objectParams(value = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function adminFacadePayload(resource, action, params = {}) {
  return {
    jwt: window.ADMIN_TOKEN,
    ...RUNTIME_MANAGER_MODULE,
    resource,
    action,
    params: objectParams(params)
  };
}

export function unwrapRuntimeFacadeResult(result) {
  if (
    result &&
    typeof result === 'object' &&
    Object.prototype.hasOwnProperty.call(result, 'resource') &&
    Object.prototype.hasOwnProperty.call(result, 'action') &&
    Object.prototype.hasOwnProperty.call(result, 'data')
  ) {
    return result.data;
  }
  return result;
}

export async function emitAdminFacade(emit, resource, action, params = {}, timeoutMs) {
  if (typeof emit !== 'function') {
    throw new Error('DESIGNER_RUNTIME_FACADE_EMITTER_MISSING: meltdownEmit unavailable');
  }
  const result = await emit(
    'cmsAdminApiRequest',
    adminFacadePayload(resource, action, params),
    timeoutMs
  );
  return unwrapRuntimeFacadeResult(result);
}
