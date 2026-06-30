const SYSTEM_WIDGET_PREFIX = '/ui/widgets/plainspace/';
const COMMUNITY_WIDGET_PATTERN = /^\/widgets\/[A-Za-z0-9_-]+\/widget\.js$/;
function currentDocumentBase() {
    if (typeof document !== 'undefined' && document.baseURI) {
        return document.baseURI;
    }
    if (typeof window !== 'undefined' && window.location?.href) {
        return window.location.href;
    }
    return 'http://localhost/';
}
function serializeSameOriginPath(url) {
    return `${url.pathname}${url.search}${url.hash}`;
}
function serializeSystemWidgetPath(pathname, url) {
    return `${pathname}${url.search}${url.hash}`;
}
export function resolveWidgetModuleUrl(input, base = currentDocumentBase()) {
    if (typeof input !== 'string' || !input.trim())
        return null;
    let baseUrl;
    let url;
    try {
        baseUrl = new URL(base);
        url = new URL(input, baseUrl);
    }
    catch {
        return null;
    }
    if (url.origin !== baseUrl.origin || !url.pathname.endsWith('.js')) {
        return null;
    }
    if (url.pathname.startsWith(SYSTEM_WIDGET_PREFIX)) {
        return serializeSystemWidgetPath(url.pathname, url);
    }
    if (COMMUNITY_WIDGET_PATTERN.test(url.pathname)) {
        return serializeSameOriginPath(url);
    }
    return null;
}
export function isAllowedWidgetModuleUrl(input, base) {
    return resolveWidgetModuleUrl(input, base) !== null;
}
