import { bpDialog } from '/assets/js/bpDialog.js';

type MeltdownEmit = (
  eventName: string,
  payload?: Record<string, unknown>
) => Promise<unknown>;

declare global {
  interface Window {
    ADMIN_TOKEN?: string;
    meltdownEmit?: MeltdownEmit;
  }
}

const BANNER_ID = 'maintenance-banner';
const BANNER_HEIGHT_VAR = '--maintenance-banner-height';
const SETTINGS_META = {
  moduleName: 'settingsManager',
  moduleType: 'core',
  key: 'MAINTENANCE_MODE'
} as const;

const bannerResizeHandlers = new WeakMap<HTMLButtonElement, () => void>();
let bannerSyncRetry: number | null = null;

function buildSettingsPayload(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...SETTINGS_META };
  const token = window.ADMIN_TOKEN;
  if (token) {
    payload.jwt = token;
  }
  return Object.assign(payload, extra);
}

function scheduleBannerSyncRetry(delay = 600): void {
  if (bannerSyncRetry !== null) return;
  bannerSyncRetry = window.setTimeout(() => {
    bannerSyncRetry = null;
    void syncMaintenanceBanner();
  }, delay);
}

function getBannerElement(): HTMLButtonElement | null {
  const el = document.getElementById(BANNER_ID);
  return el instanceof HTMLButtonElement ? el : null;
}

function updateBannerHeightVariable(banner?: HTMLButtonElement | null): void {
  if (!banner || banner.hidden) {
    document.documentElement.style.setProperty(BANNER_HEIGHT_VAR, '0px');
    return;
  }
  const height = Math.ceil(banner.getBoundingClientRect().height);
  document.documentElement.style.setProperty(BANNER_HEIGHT_VAR, `${height}px`);
}

function ensureResizeHandler(banner: HTMLButtonElement): void {
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

function detachResizeHandler(banner: HTMLButtonElement): void {
  const handler = bannerResizeHandlers.get(banner);
  if (handler) {
    window.removeEventListener('resize', handler);
  }
}

function showBanner(banner: HTMLButtonElement): void {
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

function hideBanner(banner: HTMLButtonElement): void {
  if (!banner.hidden) {
    banner.hidden = true;
  }
  banner.removeAttribute('aria-expanded');
  detachResizeHandler(banner);
  updateBannerHeightVariable();
}

function parseMaintenanceValue(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  if (value && typeof value === 'object' && 'value' in value) {
    const raw = (value as { value?: unknown }).value;
    return typeof raw === 'string' ? raw.toLowerCase() === 'true' : Boolean(raw);
  }
  return false;
}

function bindBannerClick(banner: HTMLButtonElement): void {
  if (banner.dataset.bound === 'true') return;
  banner.dataset.bound = 'true';
  banner.addEventListener('click', event => {
    event.preventDefault();
    void handleDisableMaintenance(banner);
  });
}

async function handleDisableMaintenance(banner: HTMLButtonElement): Promise<void> {
  const { meltdownEmit } = window;
  if (typeof meltdownEmit !== 'function') {
    await bpDialog.alert('Maintenance mode cannot be toggled right now. Please refresh and try again.');
    return;
  }

  const confirmed = await bpDialog.confirm(
    'Disable maintenance mode now? The site will become publicly accessible again.'
  );
  if (!confirmed) return;

  banner.disabled = true;
  banner.setAttribute('aria-busy', 'true');

  try {
    await meltdownEmit('setSetting', buildSettingsPayload({ value: 'false' }));
    hideBanner(banner);
  } catch (error) {
    console.error('[TopHeader] failed to disable maintenance mode', error);
    const friendly = error instanceof Error && error.message ? error.message : 'Please try again later.';
    await bpDialog.alert(`Failed to disable maintenance mode. ${friendly}`);
  } finally {
    banner.removeAttribute('aria-busy');
    banner.disabled = false;
  }
}

async function syncMaintenanceBanner(): Promise<void> {
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

  if (banner.dataset.loading === 'true') return;
  banner.dataset.loading = 'true';

  try {
    const value = await meltdownEmit('getSetting', buildSettingsPayload());
    if (parseMaintenanceValue(value)) {
      showBanner(banner);
    } else {
      hideBanner(banner);
    }
  } catch (error) {
    console.error('[TopHeader] failed to fetch maintenance status', error);
    hideBanner(banner);
  } finally {
    delete banner.dataset.loading;
  }
}

function bindUserProfileLink(): void {
  const userLink = document.getElementById('user-link');
  if (!(userLink instanceof HTMLAnchorElement)) return;
  if (userLink.dataset.bound === 'true' || !window.ADMIN_TOKEN) return;

  userLink.dataset.bound = 'true';
  try {
    const [, payload] = window.ADMIN_TOKEN.split('.');
    const decoded = JSON.parse(atob(payload));
    const id = decoded.userId || decoded.sub;
    if (id) {
      userLink.href = `/admin/settings/users/edit/${id}`;
    }
  } catch (error) {
    console.error('[TopHeader] token parse failed', error);
  }
}

function bindLogout(): void {
  const logoutIcon = document.getElementById('logout-icon');
  if (!(logoutIcon instanceof HTMLImageElement)) return;
  if (logoutIcon.dataset.bound === 'true') return;

  logoutIcon.dataset.bound = 'true';
  logoutIcon.addEventListener('click', () => {
    window.location.href = '/admin/logout';
  });
}

function bindSearch(): void {
  const searchToggle = document.getElementById('search-toggle');
  const searchContainer = document.querySelector('.search-container');
  const searchInput = document.getElementById('admin-search-input');

  if (!(searchToggle instanceof HTMLElement) || !(searchContainer instanceof HTMLElement) || !(searchInput instanceof HTMLInputElement)) {
    return;
  }
  if (searchToggle.dataset.bound === 'true') return;

  searchToggle.dataset.bound = 'true';
  searchToggle.addEventListener('click', event => {
    event.stopPropagation();
    searchContainer.classList.toggle('open');
    if (searchContainer.classList.contains('open')) {
      searchInput.focus();
    } else {
      searchContainer.classList.remove('active');
    }
  });

  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!searchContainer.contains(target)) {
      searchContainer.classList.remove('open', 'active');
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      searchContainer.classList.remove('open', 'active');
    }
  });
}

function markActiveSidebarLinks(): void {
  const sidebarItems = document.querySelectorAll<HTMLAnchorElement>('.sidebar .sidebar-item');
  sidebarItems.forEach(item => {
    if (item.dataset.bound === 'true') return;
    item.dataset.bound = 'true';
    try {
      const href = item.getAttribute('href') ?? '';
      const link = new URL(href || '', window.location.origin);
      if (window.location.pathname.startsWith(link.pathname)) {
        item.classList.add('active');
      }
    } catch (error) {
      console.warn('[TopHeader] invalid sidebar link', error);
    }
  });
}

async function initTopHeader(): Promise<void> {
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

export {};
