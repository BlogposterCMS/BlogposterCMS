import { fetchPartial } from '../../shared/partials/fetchPartial.js';
import { sanitizeHtml } from '../../shared/sanitize/sanitizer.js';
export async function fetchPartialSafe(name, type = '') {
    try {
        return await fetchPartial(name, type);
    }
    catch (err) {
        console.error(`[Renderer] failed to load partial ${type}/${name}`, err);
        return '';
    }
}
function resolveSidebarPartial(layout) {
    return layout.inheritsLayout === false
        ? 'empty-sidebar'
        : (layout.sidebar || 'default-sidebar');
}
async function hydrateSidebarPartial(sidebarEl, sidebarPartial) {
    if (sidebarPartial !== 'empty-sidebar') {
        sidebarEl.innerHTML = sanitizeHtml(await fetchPartialSafe(sidebarPartial));
        sidebarEl.style.display = '';
        sidebarEl.dataset.partialName = sidebarPartial;
    }
    else {
        sidebarEl.innerHTML = '';
        sidebarEl.style.display = 'none';
        sidebarEl.dataset.partialName = sidebarPartial;
    }
    document.dispatchEvent(new CustomEvent('sidebar-loaded'));
}
export async function hydrateRuntimeShellPartials(config = {}, options = {}) {
    const topHeaderEl = document.getElementById('top-header');
    const mainHeaderEl = document.getElementById('main-header');
    const sidebarEl = document.getElementById('sidebar');
    const layout = config.layout || {};
    const contentOnly = options.mode === 'content-only';
    if (!contentOnly && topHeaderEl) {
        topHeaderEl.innerHTML = sanitizeHtml(await fetchPartialSafe(layout.header || 'top-header'));
        document.dispatchEvent(new CustomEvent('top-header-loaded'));
    }
    if (!contentOnly && mainHeaderEl) {
        if (layout.inheritsLayout === false && !layout.topHeader) {
            mainHeaderEl.innerHTML = '';
        }
        else {
            mainHeaderEl.innerHTML = sanitizeHtml(await fetchPartialSafe(layout.mainHeader || 'main-header'));
            document.dispatchEvent(new CustomEvent('main-header-loaded'));
        }
    }
    const contentHeaderEl = document.getElementById('content-header');
    if (contentHeaderEl) {
        contentHeaderEl.innerHTML = sanitizeHtml(await fetchPartialSafe(layout.contentHeader || 'content-header'));
        document.dispatchEvent(new CustomEvent('content-header-loaded'));
    }
    const sidebarPartial = resolveSidebarPartial(layout);
    if (sidebarEl && (!contentOnly || sidebarEl.dataset.partialName !== sidebarPartial)) {
        await hydrateSidebarPartial(sidebarEl, sidebarPartial);
    }
}
