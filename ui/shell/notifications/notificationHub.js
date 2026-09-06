import { fetchRecentNotifications } from './notificationHubData.js';
import { renderNotificationItems } from './notificationHubView.js';
let disposeHub;
export default function initNotificationHub() {
    const logo = document.querySelector('.top-header .logo');
    if (!logo || logo.dataset.notificationBound)
        return;
    const hubElement = document.getElementById('notification-hub');
    if (!hubElement)
        return;
    const hub = hubElement;
    const list = hub.querySelector('ul');
    if (!list)
        return;
    disposeHub?.();
    logo.dataset.notificationBound = 'true';
    const listeners = new AbortController();
    const status = hub.querySelector('.notification-hub__status');
    const refresh = hub.querySelector('[data-notification-refresh]');
    const notificationList = list;
    let loading = false;
    let loaded = false;
    let lastItems = '';
    const setStatus = (message, failed = false) => {
        if (!status)
            return;
        status.textContent = message;
        status.hidden = !message;
        status.classList.toggle('is-error', failed);
    };
    const setOpen = (open, restoreFocus = false) => {
        hub.classList.toggle('open', open);
        hub.hidden = !open;
        logo.setAttribute('aria-expanded', String(open));
        if (restoreFocus)
            logo.focus();
    };
    async function loadNotifications() {
        if (loading)
            return;
        loading = true;
        hub.setAttribute('aria-busy', 'true');
        if (refresh)
            refresh.disabled = true;
        if (!loaded)
            setStatus('Loading notifications…');
        try {
            const data = await fetchRecentNotifications(window.meltdownEmit, window.ADMIN_TOKEN);
            if (!hub.isConnected || listeners.signal.aborted)
                return;
            const update = data.find(n => n.id?.startsWith('blogposter-update-') && n.actionPath === '/admin/settings/updates');
            if (update?.id && window.bpToast) {
                // One unobtrusive notification per version/session, retained in the hub.
                try {
                    if (sessionStorage.getItem('blogposter-update-notice') !== update.id) {
                        window.bpToast.info(update.message, { action: { label: 'View update', onClick: () => { window.location.href = '/admin/settings/updates'; } } });
                        sessionStorage.setItem('blogposter-update-notice', update.id);
                    }
                }
                catch { /* Storage restrictions must not prevent reading notifications. */ }
            }
            // Unchanged background refreshes must not replace a focused action link.
            const nextItems = JSON.stringify(data);
            if (nextItems !== lastItems)
                renderNotificationItems(notificationList, data);
            lastItems = nextItems;
            loaded = true;
            setStatus(data.length ? '' : 'No notifications yet. You’re up to date.');
        }
        catch (err) {
            if (listeners.signal.aborted)
                return;
            console.error('SHELL_NOTIFICATION_HUB_LOAD_FAILED: Could not load recent notifications.', err);
            setStatus('Could not load notifications. Use Refresh to try again. (SHELL_NOTIFICATION_HUB_LOAD_FAILED)', true);
        }
        finally {
            loading = false;
            hub.setAttribute('aria-busy', 'false');
            if (refresh)
                refresh.disabled = false;
        }
    }
    logo.addEventListener('click', e => {
        e.preventDefault();
        setOpen(hub.hidden);
        if (!hub.hidden) {
            void loadNotifications();
        }
    }, { signal: listeners.signal });
    refresh?.addEventListener('click', () => void loadNotifications(), { signal: listeners.signal });
    hub.querySelector('[data-notification-close]')?.addEventListener('click', () => setOpen(false, true), { signal: listeners.signal });
    // Discover notifications without requiring the user to open the hub first.
    void loadNotifications();
    const poll = window.setInterval(() => {
        if (!logo.isConnected) {
            window.clearInterval(poll);
            listeners.abort();
            return;
        }
        if (!document.hidden)
            void loadNotifications();
    }, 60000);
    document.addEventListener('click', e => {
        if (e.target instanceof Node && !hub.contains(e.target) && !logo.contains(e.target)) {
            setOpen(false);
        }
    }, { signal: listeners.signal });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !hub.hidden) {
            event.preventDefault();
            setOpen(false, true);
        }
    }, { signal: listeners.signal });
    disposeHub = () => { window.clearInterval(poll); listeners.abort(); };
}
document.addEventListener('DOMContentLoaded', initNotificationHub);
document.addEventListener('top-header-loaded', initNotificationHub);
