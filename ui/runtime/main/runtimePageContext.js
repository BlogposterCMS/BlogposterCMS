function normalizeExplicitSlug(value) {
    return typeof value === 'string' && value.length > 0 ? value : null;
}
function normalizeAdminBase(value) {
    const rawBase = typeof value === 'string' && value.trim() ? value : '/admin/';
    const withLeadingSlash = rawBase.startsWith('/') ? rawBase : `/${rawBase}`;
    return withLeadingSlash.replace(/\/+$/u, '') || '/admin';
}
function stripAdminBase(pathname, adminBase) {
    if (pathname === adminBase)
        return [];
    if (pathname.startsWith(`${adminBase}/`)) {
        return pathname.slice(adminBase.length + 1).split('/').filter(Boolean);
    }
    return pathname.split('/').filter(Boolean).slice(1);
}
function stripAdminDetailIdentifier(routeParts) {
    const lastPart = routeParts[routeParts.length - 1] || '';
    if (/^\d+$/u.test(lastPart) || /^[a-f0-9]{24}$/iu.test(lastPart)) {
        return routeParts.slice(0, -1);
    }
    return routeParts;
}
function isPathInsideBase(pathname, base) {
    return pathname === base || pathname.startsWith(`${base}/`);
}
export function resolveRuntimePageContext(input = {}) {
    const pathname = input.pathname ?? window.location.pathname;
    const adminBase = normalizeAdminBase(input.adminBase ?? window.ADMIN_BASE);
    const lane = isPathInsideBase(pathname, adminBase) || isPathInsideBase(pathname, '/admin')
        ? 'admin'
        : 'public';
    const hasNavigationPath = Object.prototype.hasOwnProperty.call(input, 'pathname');
    const explicitSlug = normalizeExplicitSlug(input.pageSlug ?? (hasNavigationPath ? null : window.PAGE_SLUG));
    const pathParts = pathname.split('/').filter(Boolean);
    const routeParts = lane === 'admin'
        ? stripAdminDetailIdentifier(stripAdminBase(pathname, adminBase))
        : pathParts;
    const routeSlug = lane === 'admin' ? routeParts.join('/') : routeParts.join('-');
    return {
        lane,
        slug: explicitSlug || routeSlug || 'dashboard',
        debug: Boolean(input.debug ?? window.DEBUG_RENDERER)
    };
}
export function applyRuntimePageTitle(page, lane) {
    if (lane === 'admin' && page?.title) {
        document.title = `${page.title} - Admin`;
    }
}
export function exposeRuntimeWidgetRegistry(widgets) {
    window.availableWidgets = Array.isArray(widgets) ? widgets : [];
}
