const MODULE_LOADER_MODULE = {
    moduleName: 'moduleLoader',
    moduleType: 'core'
};
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('MODULE_ACCESS_CONSENT_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
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
    const payload = {
        jwt,
        ...MODULE_LOADER_MODULE
    };
    if (targetModuleName)
        payload.targetModuleName = targetModuleName;
    const res = await meltdownEmit('listPendingModuleAccessRequests', payload);
    return toModuleAccessRuntimeRequests(res);
}
export async function resolveModuleAccessRequest(emit, jwt, requestId, decision, mode = 'once') {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('resolveModuleAccessRequest', {
        jwt,
        ...MODULE_LOADER_MODULE,
        requestId,
        decision,
        mode
    });
}
