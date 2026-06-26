const PAGES_MODULE = {
    moduleName: 'pagesManager',
    moduleType: 'core'
};
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('PLAINSPACE_PAGE_STATS_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
export function toPages(value) {
    if (Array.isArray(value)) {
        return value.filter((item) => Boolean(item) && typeof item === 'object');
    }
    if (value &&
        typeof value === 'object' &&
        Array.isArray(value.data)) {
        return (value.data || []).filter((item) => (Boolean(item) && typeof item === 'object'));
    }
    return [];
}
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export function buildPageLanePayload(jwt, lane) {
    return {
        jwt,
        ...PAGES_MODULE,
        lane
    };
}
export function summarizePageStats(publicPages, adminPages) {
    return {
        total: publicPages.length + adminPages.length,
        published: publicPages.filter(page => page.status === 'published').length,
        draft: publicPages.filter(page => page.status === 'draft').length,
        adminCount: adminPages.length
    };
}
export async function fetchPagesByLane(emit, jwt, lane) {
    const meltdownEmit = requireEmitter(emit);
    const res = await meltdownEmit('getPagesByLane', buildPageLanePayload(jwt, lane));
    return toPages(res);
}
export async function fetchPageStats(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const [publicPages, adminPages] = await Promise.all([
        fetchPagesByLane(meltdownEmit, jwt, 'public'),
        fetchPagesByLane(meltdownEmit, jwt, 'admin')
    ]);
    return summarizePageStats(publicPages, adminPages);
}
