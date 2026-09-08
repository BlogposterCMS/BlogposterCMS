import { fetchPartial } from '../../shared/partials/fetchPartial.js';
import { sanitizeHtml } from '../../shared/sanitize/sanitizer.js';
import { beginAdminRegion, failAdminRegion, finishAdminRegion } from '../../shared/feedback/adminShellLoading.js';
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
        await hydratePartial(sidebarEl, sidebarPartial, 'sidebar-loaded');
        sidebarEl.style.display = '';
        if (sidebarEl.dataset.adminLoading !== 'error')
            sidebarEl.dataset.partialName = sidebarPartial;
    }
    else {
        sidebarEl.innerHTML = '';
        sidebarEl.style.display = 'none';
        sidebarEl.dataset.partialName = sidebarPartial;
        finishAdminRegion(sidebarEl);
        document.dispatchEvent(new CustomEvent('sidebar-loaded'));
    }
}
async function hydratePartial(region, name, eventName) {
    const admin = Boolean(region.closest('.admin-panel'));
    if (admin)
        beginAdminRegion(region);
    try {
        const html = await fetchPartial(name);
        if (admin && !html.trim())
            throw new Error('ADMIN_SHELL_PARTIAL_EMPTY');
        region.innerHTML = sanitizeHtml(html);
        if (admin)
            finishAdminRegion(region);
        // Navigation data arrives after its static partial. Keep those empty slots
        // visible until the existing workspace loader has populated them.
        if (admin)
            region.querySelectorAll('#workspace-nav, #workspace-actions, #subpage-nav')
                .forEach(beginAdminRegion);
        document.dispatchEvent(new CustomEvent(eventName));
    }
    catch (error) {
        console.error(`[ADMIN_SHELL_PARTIAL_FAILED] ${name}`, error);
        if (admin)
            failAdminRegion(region, 'ADMIN_SHELL_PARTIAL_FAILED');
        else
            region.innerHTML = '';
    }
}
export async function hydrateRuntimeShellPartials(config = {}, options = {}) {
    const topHeaderEl = document.getElementById('top-header');
    const mainHeaderEl = document.getElementById('main-header');
    const sidebarEl = document.getElementById('sidebar');
    const layout = config.layout || {};
    const contentOnly = options.mode === 'content-only';
    const pending = [];
    if (!contentOnly && topHeaderEl) {
        pending.push(hydratePartial(topHeaderEl, layout.header || 'top-header', 'top-header-loaded'));
    }
    if (!contentOnly && mainHeaderEl) {
        if (layout.inheritsLayout === false && !layout.topHeader) {
            mainHeaderEl.innerHTML = '';
            finishAdminRegion(mainHeaderEl);
        }
        else {
            pending.push(hydratePartial(mainHeaderEl, layout.mainHeader || 'main-header', 'main-header-loaded'));
        }
    }
    const contentHeaderEl = document.getElementById('content-header');
    if (contentHeaderEl) {
        pending.push(hydratePartial(contentHeaderEl, layout.contentHeader || 'content-header', 'content-header-loaded'));
    }
    const sidebarPartial = resolveSidebarPartial(layout);
    if (sidebarEl && (!contentOnly || sidebarEl.dataset.partialName !== sidebarPartial)) {
        pending.push(hydrateSidebarPartial(sidebarEl, sidebarPartial));
    }
    // These static partials have no data dependency on each other. Paint and
    // announce each one as it arrives instead of waiting through four requests.
    await Promise.all(pending);
}
