import { createMediaExplorerSurface } from '../../../shared/media/mediaExplorerSurface.js';
import { createMediaStoragePanel } from '../../../shared/media/mediaStoragePanel.js';

export async function render(el: HTMLElement | null): Promise<void> {
  const jwt = window.ADMIN_TOKEN;
  const emitter = window.meltdownEmit;
  if (!el) return;
  if (typeof emitter !== 'function') {
    el.textContent = 'Unable to load media without an admin session.';
    return;
  }

  const surface = createMediaExplorerSurface({
    mode: 'manage',
    jwt,
    emit: emitter,
    uploadFetch: window.fetchWithTimeout,
    csrfToken: window.CSRF_TOKEN
  });

  el.innerHTML = '';
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.minHeight = '0';
  el.style.overflow = 'hidden';
  surface.element.style.flex = '1';
  surface.element.style.minHeight = '0';
  surface.element.style.height = 'auto';
  el.appendChild(createMediaStoragePanel({
    request: window.fetch.bind(window),
    csrfToken: window.CSRF_TOKEN,
    listDownloads: async () => {
      const result = await emitter('cmsAdminApiRequest', {
        jwt, moduleName: 'runtimeManager', moduleType: 'core', resource: 'media', action: 'list',
        params: { category: 'download', status: 'active', visibility: 'public', limit: 50 }
      });
      const rows = result && typeof result === 'object' && 'data' in result ? result.data : result;
      return Array.isArray(rows) ? rows : [];
    }
  }));
  el.appendChild(surface.element);
}
