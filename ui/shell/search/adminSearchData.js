function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('SHELL_ADMIN_SEARCH_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
function isSearchPage(value) {
    return Boolean(value) &&
        typeof value === 'object' &&
        (typeof value.id === 'string' || typeof value.id === 'number');
}
export function resultPages(res) {
    const items = Array.isArray(res)
        ? res
        : res && typeof res === 'object'
            ? (res.pages || res.rows || [])
            : [];
    return items.filter(isSearchPage);
}
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export function adminSearchDisabledPlaceholder(err) {
    const message = errorMessage(err);
    if (/permission/i.test(message))
        return 'Search unavailable';
    if (/(token|auth)/i.test(message))
        return 'Login required';
    return null;
}
export async function fetchAdminSearchPages(emit, jwt, query, limit = 10) {
    const meltdownEmit = requireEmitter(emit);
    const res = await meltdownEmit('searchPages', {
        jwt,
        moduleName: 'pagesManager',
        moduleType: 'core',
        query,
        lane: 'all',
        limit
    });
    return resultPages(res);
}
