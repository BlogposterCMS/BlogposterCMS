import { createLoader } from './loading.js';

// Store the timer on the region itself: the small first-HTML entry and the
// renderer bundle share the same DOM lifecycle, even when bundled separately.
type LoadingRegion = HTMLElement & { adminLoadingTimer?: number };
export const ADMIN_LOADING_TIMEOUT_MS = 30000;

function clearLoadingTimer(region: LoadingRegion): void {
  window.clearTimeout(region.adminLoadingTimer);
  delete region.adminLoadingTimer;
}

function markPreviousContent(region: HTMLElement): void {
  if (region.id !== 'content') return;
  region.querySelectorAll<HTMLElement>(':scope > :not(.admin-shell-feedback):not(#content-header)')
    .forEach(child => { child.dataset.adminLoadingStale = 'true'; });
}

function ensureFeedback(region: HTMLElement): HTMLElement {
  const existing = region.querySelector<HTMLElement>(':scope > .admin-shell-feedback');
  if (existing) return existing;
  const feedback = document.createElement('div');
  feedback.className = 'admin-shell-feedback';
  feedback.append(createLoader({ variant: 'skeleton', label: 'Bereich wird geladen', lines: 4 }));
  const error = document.createElement('div');
  error.className = 'admin-shell-error';
  error.setAttribute('role', 'alert');
  const message = document.createElement('p');
  message.textContent = 'Dieser Bereich konnte nicht geladen werden.';
  const retry = document.createElement('a');
  retry.className = 'button secondary';
  retry.textContent = 'Erneut versuchen';
  retry.href = window.location.href;
  // Reload the current authenticated route, including after a timed-out request.
  // The top target bypasses content navigation and discards unfinished work.
  retry.target = '_top';
  error.append(message, retry);
  feedback.append(error);
  region.prepend(feedback);
  return feedback;
}

export function failAdminRegion(region: HTMLElement, code = 'ADMIN_SHELL_LOAD_FAILED'): void {
  clearLoadingTimer(region);
  markPreviousContent(region);
  ensureFeedback(region);
  region.dataset.adminLoading = 'error';
  region.dataset.adminLoadingError = code;
  region.setAttribute('aria-busy', 'false');
}

export function beginAdminRegion(region: LoadingRegion): void {
  // The independent first-HTML entry may already have started this region.
  if (region.dataset.adminLoading === 'loading' && region.adminLoadingTimer !== undefined) return;
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

export function finishAdminRegion(region: HTMLElement): void {
  clearLoadingTimer(region);
  region.querySelectorAll<HTMLElement>(':scope > [data-admin-loading-stale]')
    .forEach(child => { delete child.dataset.adminLoadingStale; });
  region.querySelector(':scope > .admin-shell-feedback')?.remove();
  region.dataset.adminLoading = 'ready';
  delete region.dataset.adminLoadingError;
  region.setAttribute('aria-busy', 'false');
}

export function initializeAdminShellLoading(): void {
  document.querySelectorAll<HTMLElement>('.admin-panel [data-admin-loading="loading"]')
    .forEach(beginAdminRegion);
}
