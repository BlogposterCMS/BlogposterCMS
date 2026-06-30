const RUNTIME_MANAGER_MODULE = {
    moduleName: 'runtimeManager',
    moduleType: 'core'
};
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('MODULE_ACCESS_CONSENT_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
function objectParams(value = {}) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function unwrapRuntimeFacadeData(value) {
    if (value &&
        typeof value === 'object' &&
        'resource' in value &&
        'action' in value &&
        'data' in value) {
        return value.data;
    }
    return value;
}
async function emitRuntimeAdmin(emit, jwt, resource, action, params = {}) {
    const result = await emit('cmsAdminApiRequest', {
        jwt,
        ...RUNTIME_MANAGER_MODULE,
        resource,
        action,
        params: objectParams(params)
    });
    return unwrapRuntimeFacadeData(result);
}
function toArray(value) {
    if (Array.isArray(value))
        return value;
    if (value && typeof value === 'object' && Array.isArray(value.data)) {
        return value.data;
    }
    return [];
}
export function toModuleAccessRuntimeRequests(value) {
    return toArray(value)
        .filter((item) => Boolean(item) && typeof item === 'object' && typeof item.id === 'string');
}
export function moduleAccessErrorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export async function fetchPendingModuleAccessRequests(emit, jwt, targetModuleName) {
    const meltdownEmit = requireEmitter(emit);
    const payload = {};
    if (targetModuleName)
        payload.targetModuleName = targetModuleName;
    const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'modules', 'accessRequests', payload);
    return toModuleAccessRuntimeRequests(res);
}
export async function resolveModuleAccessRequest(emit, jwt, requestId, decision, mode = 'once') {
    const meltdownEmit = requireEmitter(emit);
    await emitRuntimeAdmin(meltdownEmit, jwt, 'modules', 'resolveAccessRequest', {
        requestId,
        decision,
        mode
    });
}
