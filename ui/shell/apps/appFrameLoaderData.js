export const APP_BRIDGE_REQUEST = 'cms-app-runtime-request';
export const APP_BRIDGE_BATCH_REQUEST = 'cms-app-runtime-batch-request';
export const APP_BRIDGE_RESPONSE = 'cms-app-runtime-response';
const APP_LOADER_MODULE = {
    moduleName: 'appLoader',
    moduleType: 'core'
};
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('SHELL_APP_FRAME_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
export function objectPayload(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
}
export function unwrapAppEventResult(result) {
    return result && typeof result === 'object' && 'data' in result
        ? result.data
        : result;
}
export async function dispatchAppRuntimeRequest(emit, jwt, appName, eventName, payload) {
    const meltdownEmit = requireEmitter(emit);
    const safeEventName = eventName.trim();
    if (!safeEventName) {
        throw new Error('SHELL_APP_FRAME_EVENT_NAME_MISSING: Missing bridge eventName');
    }
    const result = await meltdownEmit('dispatchAppEvent', {
        jwt,
        ...APP_LOADER_MODULE,
        appName,
        event: APP_BRIDGE_REQUEST,
        data: {
            eventName: safeEventName,
            payload: objectPayload(payload)
        }
    });
    return unwrapAppEventResult(result);
}
export async function dispatchAppRuntimeBatch(emit, jwt, appName, events) {
    const meltdownEmit = requireEmitter(emit);
    const result = await meltdownEmit('dispatchAppEvent', {
        jwt,
        ...APP_LOADER_MODULE,
        appName,
        event: APP_BRIDGE_BATCH_REQUEST,
        data: {
            events: Array.isArray(events) ? events : []
        }
    });
    return unwrapAppEventResult(result);
}
export async function dispatchAppLifecycleMessage(emit, jwt, appName, eventType, data) {
    const meltdownEmit = requireEmitter(emit);
    return meltdownEmit('dispatchAppEvent', {
        jwt,
        ...APP_LOADER_MODULE,
        appName,
        event: eventType,
        data: data || {}
    });
}
