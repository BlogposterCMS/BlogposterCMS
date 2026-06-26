import { buildInitialPageDataRequest, pageDataCacheKey, sanitizePageData, unwrapMeltdownResult } from './pageDataLoaderData.js';
const meltdownEmit = window.meltdownEmit;
const jwt = window.ADMIN_TOKEN;
const cache = new Map();
export async function load(eventName, payload = {}, opts = {}) {
    if (!jwt || !eventName || !meltdownEmit)
        return null;
    const key = pageDataCacheKey(eventName, payload);
    const cached = cache.get(key);
    if (cached)
        return cached;
    const promise = meltdownEmit(eventName, { jwt, ...payload })
        .then(res => sanitizePageData(unwrapMeltdownResult(res), opts.fields))
        .catch(err => {
        console.error('[pageDataLoader] fetch error', err);
        cache.delete(key);
        return null;
    });
    cache.set(key, promise);
    return promise;
}
export function clear(eventName, payload) {
    if (!eventName) {
        cache.clear();
        return;
    }
    const key = pageDataCacheKey(eventName, payload || {});
    cache.delete(key);
}
if (typeof window.meltdownEmit === 'function') {
    window.pageDataLoader = { load, clear };
    window.addEventListener('pagehide', () => clear());
    if (window.PAGE_ID) {
        const request = buildInitialPageDataRequest(window.PAGE_ID);
        window.pageDataPromise = load(request.eventName, request.payload, { fields: request.fields });
    }
}
