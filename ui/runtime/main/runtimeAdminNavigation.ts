import type { RuntimePageContextInput } from './runtimePageContext.js';
import { confirmWorkspaceNavigation, getWorkspaceChangeState } from '../../shared/navigation/workspaceChanges.js';
import { registerWorkspaceAgent, agentString } from '../../shared/agent/workspaceAgent.js';

export type RuntimeAdminNavigationRequest = RuntimePageContextInput & {
  url: URL;
};

export type RuntimeAdminNavigationOptions = {
  render: (request: RuntimeAdminNavigationRequest) => Promise<void>;
  adminBase?: string;
};

const ADMIN_NAV_STATE_KEY = 'bpAdminContentNavigation';

function normaliseAdminBase(base: string): string {
  const trimmed = base.trim() || '/admin/';
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+$/u, '');
}

function resolveAdminBase(configuredBase?: string): string {
  return normaliseAdminBase(configuredBase || window.ADMIN_BASE || '/admin/');
}

function isPlainLeftClick(event: MouseEvent): boolean {
  return event.button === 0
    && !event.defaultPrevented
    && !event.metaKey
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey;
}

function canHandleAnchor(anchor: HTMLAnchorElement, url: URL, adminBase: string): boolean {
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.hasAttribute('download')) return false;
  if (url.origin !== window.location.origin) return false;
  if (url.hash && url.pathname === window.location.pathname && url.search === window.location.search) {
    return false;
  }
  return url.pathname === adminBase || url.pathname.startsWith(`${adminBase}/`);
}

function announceNavigation(url: URL): void {
  document.dispatchEvent(new CustomEvent('admin-content-navigated', {
    detail: { pathname: url.pathname }
  }));
  document.dispatchEvent(new CustomEvent('main-header-loaded'));
  document.dispatchEvent(new CustomEvent('sidebar-loaded'));
}

export function bindAdminContentNavigation({
  render,
  adminBase
}: RuntimeAdminNavigationOptions): () => void {
  const resolvedAdminBase = resolveAdminBase(adminBase);
  let navigationPromise: Promise<void> = Promise.resolve();
  let checking = false;
  let currentUrl = window.location.href;
  let currentIndex = Number(window.history.state?.[ADMIN_NAV_STATE_KEY]) || 0;
  let restoringHistory = false;
  window.history.replaceState({ ...window.history.state, [ADMIN_NAV_STATE_KEY]: currentIndex }, '', currentUrl);

  async function renderUrl(url: URL): Promise<void> {
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

  function handleClick(event: MouseEvent): void {
    if (!isPlainLeftClick(event)) return;
    // Widget links live inside shadow roots, where event.target is the host.
    const target = event.composedPath().find(node => node instanceof HTMLAnchorElement) as HTMLAnchorElement | undefined;
    if (!target) return;

    const url = new URL(target.href, window.location.href);
    if (!canHandleAnchor(target, url, resolvedAdminBase)) return;

    event.preventDefault();
    if (url.pathname === window.location.pathname && url.search === window.location.search) {
      return;
    }

    if (checking) return;
    checking = true;
    void (async () => {
      try {
        if (!(await confirmWorkspaceNavigation())) return;
        currentIndex += 1;
        currentUrl = url.href;
        window.history.pushState({ [ADMIN_NAV_STATE_KEY]: currentIndex }, '', url.href);
        await renderUrl(url);
      } catch (error) {
        console.error('[BP-ADMIN-NAV-RENDER] content navigation failed', error);
        window.location.assign(url.href);
      } finally {
        checking = false;
      }
    })();
  }

  function handlePopState(): void {
    if (restoringHistory) {
      restoringHistory = false;
      return;
    }
    const url = new URL(window.location.href);
    if (!canHandleAnchor(document.createElement('a'), url, resolvedAdminBase)) return;
    const targetIndex = window.history.state?.[ADMIN_NAV_STATE_KEY];
    void (async () => {
      if (!(await confirmWorkspaceNavigation())) {
        // Restore a known SPA history entry without destroying Forward history.
        if (typeof targetIndex === 'number' && targetIndex !== currentIndex) {
          restoringHistory = true;
          window.history.go(currentIndex - targetIndex);
        } else {
          window.history.replaceState({ ...window.history.state, [ADMIN_NAV_STATE_KEY]: currentIndex }, '', currentUrl);
        }
        return;
      }
      currentUrl = url.href;
      currentIndex = typeof targetIndex === 'number' ? targetIndex : currentIndex;
      await renderUrl(url);
    })().catch(error => {
      console.error('[BP-ADMIN-NAV-POP] popstate render failed', error);
      window.location.reload();
    });
  }

  document.addEventListener('click', handleClick);
  window.addEventListener('popstate', handlePopState);

  const destinations: Record<string, string> = {
    home: '/home', pages: '/content/pages', media: '/content/media', navigation: '/content/menu',
    widgets: '/content/widgets', designs: '/content/designer-layouts', settings: '/settings',
    branding: '/settings/design', seo: '/settings/seo', security: '/settings/security'
  };
  const shell = document.querySelector<HTMLElement>('.admin-panel');
  let pendingDesignUrl: string | null = null;
  async function openAgentRoute(path: string) {
    if (checking) throw new Error('CMS_AGENT_NAVIGATION_BUSY');
    checking = true;
    try {
      const url = new URL(`${resolvedAdminBase}${path}`, window.location.origin);
      currentIndex += 1;
      currentUrl = url.href;
      window.history.pushState({ [ADMIN_NAV_STATE_KEY]: currentIndex }, '', url.href);
      await renderUrl(url);
    } finally { checking = false; }
  }
  const shellAgent = shell ? registerWorkspaceAgent({ root: shell, id: 'shell', title: 'CMS navigation',
    read: () => ({ ...getWorkspaceChangeState(), route: window.location.pathname, workspaces: destinations, pendingDesignUrl }),
    onCommandSettled: (command, acknowledged) => {
      if (command.action !== 'cms.openDesign' || !pendingDesignUrl) return;
      const url = pendingDesignUrl;
      pendingDesignUrl = null;
      // Studio owns a separate app document. Acknowledge the handoff before
      // unloading this host; its new surface reports actual loading/ready state.
      if (acknowledged) window.location.assign(url);
    },
    actions: [
      { action: 'cms.openWorkspace', label: 'Open a CMS workspace', params: [{ name: 'workspace', type: 'string', required: true }], run: p => {
        const path = destinations[agentString(p, 'workspace')];
        if (!path) throw new Error('CMS_AGENT_WORKSPACE_UNKNOWN');
        return openAgentRoute(path);
      } },
      { action: 'cms.openPage', label: 'Open page editor', params: [{ name: 'id', type: 'string', required: true }], run: p => {
        const id = agentString(p, 'id');
        if (!/^\d+$/.test(id)) throw new Error('CMS_AGENT_PAGE_ID_INVALID');
        return openAgentRoute(`/pages/edit/${id}`);
      } },
      { action: 'cms.openDesign', label: 'Open Design Studio', params: [{ name: 'id', type: 'string', required: false }], run: p => {
        const id = p.id == null ? '' : agentString(p, 'id');
        if (id && !/^\d+$/.test(id)) throw new Error('CMS_AGENT_DESIGN_ID_INVALID');
        pendingDesignUrl = `${resolvedAdminBase}/studio/design${id ? `/${id}` : ''}`;
        return { navigation: 'scheduled', url: pendingDesignUrl, nextSurface: 'studio.designer' };
      } }
    ]
  }) : null;

  return () => {
    shellAgent?.stop();
    document.removeEventListener('click', handleClick);
    window.removeEventListener('popstate', handlePopState);
  };
}
