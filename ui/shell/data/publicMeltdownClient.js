import { createMeltdownClient } from '../../shared/api-client/meltdownClient.js';
import { runtimePublicPayload, unwrapRuntimeFacadeData } from '../../shared/api-client/runtimeFacade.js';
function runtimeToken(value) {
    if (value === null || value === undefined)
        return value;
    return String(value);
}
function browserFetch(win) {
    if (typeof win.fetchWithTimeout === 'function') {
        return ((resource, options) => win.fetchWithTimeout?.(resource, options) ?? Promise.reject(new Error('SHELL_PUBLIC_MELTDOWN_FETCH_UNAVAILABLE: fetchWithTimeout unavailable')));
    }
    if (typeof win.fetch === 'function') {
        return win.fetch.bind(win);
    }
    throw new Error('SHELL_PUBLIC_MELTDOWN_FETCH_UNAVAILABLE: browser fetch unavailable');
}
export function resolveShellPublicClient(win) {
    if (win.blogposterApi && typeof win.blogposterApi.emit === 'function') {
        return win.blogposterApi;
    }
    return createMeltdownClient({
        fetchImpl: browserFetch(win),
        throttleDelay: 0,
        debug: () => Boolean(win.DEBUG_MELTDOWN)
    });
}
export async function issueShellPublicToken(client, purpose) {
    return client.emit('issuePublicToken', {
        purpose,
        moduleName: 'auth'
    });
}
export async function fetchShellPublicSetting(client, publicToken, key) {
    const result = await client.emit('cmsPublicRuntimeRequest', runtimePublicPayload(runtimeToken(publicToken), 'settings', 'public', { keys: [key] }));
    const settings = unwrapRuntimeFacadeData(result);
    return settings && typeof settings === 'object' ? settings[key] : undefined;
}
export function publicSettingEnabled(value) {
    return String(value).toLowerCase() === 'true';
}
