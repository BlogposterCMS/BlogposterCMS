import { createLoader } from './loading.js';
export const ADMIN_LOADING_TIMEOUT_MS = 30000;
function clearLoadingTimer(region) {
    window.clearTimeout(region.adminLoadingTimer);
    delete region.adminLoadingTimer;
}
function markPreviousContent(region) {
    if (region.id !== 'content')
        return;
    region.querySelectorAll(':scope > :not(.admin-shell-feedback):not(#content-header)')
        .forEach(child => { child.dataset.adminLoadingStale = 'true'; });
}
function ensureFeedback(region) {
    const existing = region.querySelector(':scope > .admin-shell-feedback');
    if (existing)
        return existing;
    const feedback = document.createElement('div');
    feedback.className = 'admin-shell-feedback';
    feedback.append(createLoader({ variant: 'skeleton', label: 'Loading section', lines: 4 }));
    const error = document.createElement('div');
    error.className = 'admin-shell-error';
    error.setAttribute('role', 'alert');
    const message = document.createElement('p');
    message.textContent = 'This section could not be loaded.';
    const retry = document.createElement('a');
    retry.className = 'button secondary';
    retry.textContent = 'Try again';
    retry.href = window.location.href;
    // Reload the current authenticated route, including after a timed-out request.
    // The top target bypasses content navigation and discards unfinished work.
    retry.target = '_top';
    error.append(message, retry);
    feedback.append(error);
    region.prepend(feedback);
    return feedback;
}
export function failAdminRegion(region, code = 'ADMIN_SHELL_LOAD_FAILED') {
    clearLoadingTimer(region);
    markPreviousContent(region);
    ensureFeedback(region);
    region.dataset.adminLoading = 'error';
    region.dataset.adminLoadingError = code;
    region.setAttribute('aria-busy', 'false');
}
export function beginAdminRegion(region) {
    // The independent first-HTML entry may already have started this region.
    if (region.dataset.adminLoading === 'loading' && region.adminLoadingTimer !== undefined)
        return;
    clearLoadingTimer(region);
    markPreviousContent(region);
    ensureFeedback(region);
    region.dataset.adminLoading = 'loading';
    delete region.dataset.adminLoadingError;
    region.setAttribute('aria-busy', 'true');
    region.adminLoadingTimer = window.setTimeout(() => {
        console.error(`[ADMIN_SHELL_LOAD_TIMEOUT] ${region.id}`);
        failAdminRegion(region, 'ADMIN_SHELL_LOAD_TIMEOUT');
    }, ADMIN_LOADING_TIMEOUT_MS);
}
export function finishAdminRegion(region) {
    clearLoadingTimer(region);
    region.querySelectorAll(':scope > [data-admin-loading-stale]')
        .forEach(child => { delete child.dataset.adminLoadingStale; });
    region.querySelector(':scope > .admin-shell-feedback')?.remove();
    region.dataset.adminLoading = 'ready';
    delete region.dataset.adminLoadingError;
    region.setAttribute('aria-busy', 'false');
}
export function initializeAdminShellLoading() {
    document.querySelectorAll('.admin-panel [data-admin-loading="loading"]')
        .forEach(beginAdminRegion);
}
