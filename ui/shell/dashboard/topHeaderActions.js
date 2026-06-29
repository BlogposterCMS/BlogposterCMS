import { bpDialog } from '../../shared/dialogs/bpDialog.js';
import './moduleAccessConsent.js';
import { setSearchExpanded } from '../search/searchExpansion.js';
import { bindAccountMenu } from './topHeaderAccountMenu.js';
import { disableMaintenanceMode, errorMessage, fetchMaintenanceMode, fetchProjectName, PROJECT_NAME_FALLBACK } from './topHeaderActionsData.js';
const BANNER_ID = 'maintenance-banner';
const BANNER_HEIGHT_VAR = '--maintenance-banner-height';
const PROJECT_NAME_ID = 'project-name';
const bannerResizeHandlers = new WeakMap();
let bannerSyncRetry = null;
let projectNameSyncRetry = null;
function scheduleBannerSyncRetry(delay = 600) {
    if (bannerSyncRetry !== null)
        return;
    bannerSyncRetry = window.setTimeout(() => {
        bannerSyncRetry = null;
        void syncMaintenanceBanner();
    }, delay);
}
function scheduleProjectNameSyncRetry(delay = 600) {
    if (projectNameSyncRetry !== null)
        return;
    projectNameSyncRetry = window.setTimeout(() => {
        projectNameSyncRetry = null;
        void syncProjectName();
    }, delay);
}
function getBannerElement() {
    const el = document.getElementById(BANNER_ID);
    return el instanceof HTMLButtonElement ? el : null;
}
function getProjectNameElement() {
    const el = document.getElementById(PROJECT_NAME_ID);
    return el instanceof HTMLElement ? el : null;
}
function updateProjectName(name = PROJECT_NAME_FALLBACK) {
    const safeName = name.trim() || PROJECT_NAME_FALLBACK;
    const projectName = getProjectNameElement();
    const homeLink = document.getElementById('home-link');
    if (projectName) {
        projectName.textContent = safeName;
    }
    if (homeLink instanceof HTMLAnchorElement) {
        const label = `Open public site: ${safeName}`;
        homeLink.setAttribute('aria-label', label);
        homeLink.removeAttribute('title');
    }
}
function updateBannerHeightVariable(banner) {
    if (!banner || banner.hidden) {
        document.documentElement.style.setProperty(BANNER_HEIGHT_VAR, '0px');
        return;
    }
    const height = Math.ceil(banner.getBoundingClientRect().height);
    document.documentElement.style.setProperty(BANNER_HEIGHT_VAR, `${height}px`);
}
function ensureResizeHandler(banner) {
    if (!bannerResizeHandlers.has(banner)) {
        bannerResizeHandlers.set(banner, () => {
            if (!banner.hidden) {
                updateBannerHeightVariable(banner);
            }
        });
    }
    const handler = bannerResizeHandlers.get(banner);
    if (handler) {
        window.addEventListener('resize', handler);
    }
}
function detachResizeHandler(banner) {
    const handler = bannerResizeHandlers.get(banner);
    if (handler) {
        window.removeEventListener('resize', handler);
    }
}
function showBanner(banner) {
    if (!banner.hidden) {
        updateBannerHeightVariable(banner);
        return;
    }
    banner.hidden = false;
    banner.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => {
        updateBannerHeightVariable(banner);
    });
    ensureResizeHandler(banner);
}
function hideBanner(banner) {
    if (!banner.hidden) {
        banner.hidden = true;
    }
    banner.removeAttribute('aria-expanded');
    detachResizeHandler(banner);
    updateBannerHeightVariable();
}
function bindBannerClick(banner) {
    if (banner.dataset.bound === 'true')
        return;
    banner.dataset.bound = 'true';
    banner.addEventListener('click', event => {
        event.preventDefault();
        void handleDisableMaintenance(banner);
    });
}
async function handleDisableMaintenance(banner) {
    const { meltdownEmit } = window;
    if (typeof meltdownEmit !== 'function') {
        await bpDialog.alert('Maintenance mode cannot be toggled right now. Please refresh and try again.');
        return;
    }
    const confirmed = await bpDialog.confirm('Disable maintenance mode now? The site will become publicly accessible again.');
    if (!confirmed)
        return;
    banner.disabled = true;
    banner.setAttribute('aria-busy', 'true');
    try {
        await disableMaintenanceMode(meltdownEmit, window.ADMIN_TOKEN);
        hideBanner(banner);
        // Always re-check maintenance status after toggling to keep the UI honest and
        // avoid stale state if another admin flips the setting concurrently.
        await syncMaintenanceBanner();
    }
    catch (error) {
        console.error('[TopHeader] failed to disable maintenance mode', error);
        const friendly = error instanceof Error && error.message ? errorMessage(error) : 'Please try again later.';
        await bpDialog.alert(`Failed to disable maintenance mode. ${friendly}`);
    }
    finally {
        banner.removeAttribute('aria-busy');
        banner.disabled = false;
    }
}
async function syncMaintenanceBanner() {
    const banner = getBannerElement();
    if (!banner) {
        updateBannerHeightVariable();
        return;
    }
    bindBannerClick(banner);
    const { meltdownEmit } = window;
    if (typeof meltdownEmit !== 'function') {
        hideBanner(banner);
        scheduleBannerSyncRetry();
        return;
    }
    if (banner.dataset.loading === 'true')
        return;
    banner.dataset.loading = 'true';
    try {
        if (await fetchMaintenanceMode(meltdownEmit, window.ADMIN_TOKEN)) {
            showBanner(banner);
        }
        else {
            hideBanner(banner);
        }
    }
    catch (error) {
        console.error('[TopHeader] failed to fetch maintenance status', error);
        hideBanner(banner);
    }
    finally {
        delete banner.dataset.loading;
    }
}
async function syncProjectName() {
    const projectName = getProjectNameElement();
    if (!projectName)
        return;
    const { meltdownEmit } = window;
    if (typeof meltdownEmit !== 'function') {
        updateProjectName();
        scheduleProjectNameSyncRetry();
        return;
    }
    if (projectName.dataset.loading === 'true')
        return;
    projectName.dataset.loading = 'true';
    try {
        updateProjectName(await fetchProjectName(meltdownEmit, window.ADMIN_TOKEN));
    }
    catch (error) {
        console.error('[TopHeader] failed to fetch project name', error);
        updateProjectName();
    }
    finally {
        delete projectName.dataset.loading;
    }
}
function bindUserProfileLink() {
    const userLink = document.getElementById('user-link');
    if (!(userLink instanceof HTMLAnchorElement))
        return;
    if (userLink.dataset.bound === 'true' || !window.ADMIN_TOKEN)
        return;
    userLink.dataset.bound = 'true';
    try {
        const [, payload] = window.ADMIN_TOKEN.split('.');
        if (!payload)
            return;
        const decoded = JSON.parse(atob(payload));
        const id = decoded.userId || decoded.sub;
        if (id) {
            userLink.href = `/admin/settings/users/edit/${id}`;
        }
    }
    catch (error) {
        console.error('[TopHeader] token parse failed', error);
    }
}
function bindLogout() {
    const logoutIcon = document.getElementById('logout-icon');
    if (!(logoutIcon instanceof HTMLElement))
        return;
    if (logoutIcon.dataset.bound === 'true')
        return;
    logoutIcon.dataset.bound = 'true';
    logoutIcon.addEventListener('click', () => {
        window.location.href = '/admin/logout';
    });
}
function bindSearch() {
    const searchToggle = document.getElementById('search-toggle');
    const searchContainer = document.querySelector('.search-container');
    const searchInput = document.getElementById('admin-search-input');
    if (!(searchToggle instanceof HTMLElement) || !(searchContainer instanceof HTMLElement) || !(searchInput instanceof HTMLInputElement)) {
        return;
    }
    if (searchToggle.dataset.bound === 'true')
        return;
    searchToggle.dataset.bound = 'true';
    searchToggle.addEventListener('click', event => {
        event.stopPropagation();
        const expanded = !searchContainer.classList.contains('is-expanded');
        setSearchExpanded(searchContainer, searchInput, expanded);
        if (expanded) {
            searchInput.focus();
        }
        else {
            searchContainer.classList.remove('active');
        }
    });
    document.addEventListener('click', event => {
        const target = event.target;
        if (!(target instanceof Node))
            return;
        if (!searchContainer.contains(target)) {
            setSearchExpanded(searchContainer, searchInput, false);
            searchContainer.classList.remove('active');
        }
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            setSearchExpanded(searchContainer, searchInput, false);
            searchContainer.classList.remove('active');
        }
    });
}
function markActiveSidebarLinks() {
    const sidebarItems = document.querySelectorAll('.sidebar .sidebar-item');
    sidebarItems.forEach(item => {
        if (item.dataset.bound === 'true')
            return;
        item.dataset.bound = 'true';
        try {
            const href = item.getAttribute('href') ?? '';
            const link = new URL(href || '', window.location.origin);
            if (window.location.pathname.startsWith(link.pathname)) {
                item.classList.add('active');
            }
        }
        catch (error) {
            console.warn('[TopHeader] invalid sidebar link', error);
        }
    });
}
async function initTopHeader() {
    void syncProjectName();
    bindAccountMenu();
    bindUserProfileLink();
    bindLogout();
    bindSearch();
    markActiveSidebarLinks();
    await syncMaintenanceBanner();
}
document.addEventListener('DOMContentLoaded', () => {
    updateBannerHeightVariable();
    void initTopHeader();
});
document.addEventListener('top-header-loaded', () => {
    void initTopHeader();
});
