const ADMIN_NAV_STATE_KEY = 'bpAdminContentNavigation';
function normaliseAdminBase(base) {
    const trimmed = base.trim() || '/admin/';
    const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return withSlash.replace(/\/+$/u, '');
}
function resolveAdminBase(configuredBase) {
    return normaliseAdminBase(configuredBase || window.ADMIN_BASE || '/admin/');
}
function isPlainLeftClick(event) {
    return event.button === 0
        && !event.defaultPrevented
        && !event.metaKey
        && !event.ctrlKey
        && !event.shiftKey
        && !event.altKey;
}
function canHandleAnchor(anchor, url, adminBase) {
    if (anchor.target && anchor.target !== '_self')
        return false;
    if (anchor.hasAttribute('download'))
        return false;
    if (url.origin !== window.location.origin)
        return false;
    if (url.hash && url.pathname === window.location.pathname && url.search === window.location.search) {
        return false;
    }
    return url.pathname === adminBase || url.pathname.startsWith(`${adminBase}/`);
}
function announceNavigation(url) {
    document.dispatchEvent(new CustomEvent('admin-content-navigated', {
        detail: { pathname: url.pathname }
    }));
    document.dispatchEvent(new CustomEvent('main-header-loaded'));
    document.dispatchEvent(new CustomEvent('sidebar-loaded'));
}
export function bindAdminContentNavigation({ render, adminBase }) {
    const resolvedAdminBase = resolveAdminBase(adminBase);
    let navigationPromise = Promise.resolve();
    async function renderUrl(url) {
        const pathname = url.pathname;
        navigationPromise = navigationPromise
            .catch(() => undefined)
            .then(async () => {
            await render({
                pathname,
                debug: Boolean(window.DEBUG_RENDERER),
                adminBase: resolvedAdminBase,
                url
            });
            announceNavigation(url);
        });
        await navigationPromise;
    }
    function handleClick(event) {
        if (!isPlainLeftClick(event))
            return;
        const target = event.target instanceof Element
            ? event.target.closest('a[href]')
            : null;
        if (!target)
            return;
        const url = new URL(target.href, window.location.href);
        if (!canHandleAnchor(target, url, resolvedAdminBase))
            return;
        event.preventDefault();
        if (url.pathname === window.location.pathname && url.search === window.location.search) {
            return;
        }
        window.history.pushState({ [ADMIN_NAV_STATE_KEY]: true }, '', url.href);
        void renderUrl(url).catch(error => {
            console.error('[BP-ADMIN-NAV-RENDER] content navigation failed', error);
            window.location.assign(url.href);
        });
    }
    function handlePopState() {
        const url = new URL(window.location.href);
        if (!canHandleAnchor(document.createElement('a'), url, resolvedAdminBase))
            return;
        void renderUrl(url).catch(error => {
            console.error('[BP-ADMIN-NAV-POP] popstate render failed', error);
            window.location.reload();
        });
    }
    document.addEventListener('click', handleClick);
    window.addEventListener('popstate', handlePopState);
    return () => {
        document.removeEventListener('click', handleClick);
        window.removeEventListener('popstate', handlePopState);
    };
}
