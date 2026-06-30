const RUNTIME_MANAGER_MODULE = {
    moduleName: 'runtimeManager',
    moduleType: 'core'
};
function objectParams(value = {}) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
export function unwrapRuntimeFacadeData(value) {
    if (value &&
        typeof value === 'object' &&
        'resource' in value &&
        'action' in value &&
        'data' in value) {
        return value.data;
    }
    return value;
}
export function runtimeAdminPayload(jwt, resource, action, params = {}) {
    return {
        jwt,
        ...RUNTIME_MANAGER_MODULE,
        resource,
        action,
        params: objectParams(params)
    };
}
export function runtimePublicPayload(jwt, resource, action, params = {}) {
    return {
        jwt,
        ...RUNTIME_MANAGER_MODULE,
        resource,
        action,
        params: objectParams(params)
    };
}
export async function emitRuntimeAdmin(emit, jwt, resource, action, params = {}, timeoutMs) {
    const payload = runtimeAdminPayload(jwt, resource, action, params);
    const result = timeoutMs === undefined
        ? await emit('cmsAdminApiRequest', payload)
        : await emit('cmsAdminApiRequest', payload, timeoutMs);
    return unwrapRuntimeFacadeData(result);
}
export async function emitRuntimePublic(emit, jwt, resource, action, params = {}, timeoutMs) {
    const payload = runtimePublicPayload(jwt, resource, action, params);
    const result = timeoutMs === undefined
        ? await emit('cmsPublicRuntimeRequest', payload)
        : await emit('cmsPublicRuntimeRequest', payload, timeoutMs);
    return unwrapRuntimeFacadeData(result);
}
