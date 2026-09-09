import { createMediaExplorerSurface } from '../../../shared/media/mediaExplorerSurface.js';
import { createMediaStoragePanel } from '../../../shared/media/mediaStoragePanel.js';
import { listMediaStorageLocations } from '../../../shared/media/mediaStorageLocations.js';
import { bpDialog } from '../../../shared/dialogs/bpDialog.js';

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
    csrfToken: window.CSRF_TOKEN,
    loadStorageLocations: () => listMediaStorageLocations(window.fetch.bind(window), emitter, jwt),
    onPublishDownload: async connectionId => {
      await bpDialog.open({ title: 'Publish download', body: createMediaStoragePanel({
        mode: 'publish', request: window.fetch.bind(window), csrfToken: window.CSRF_TOKEN, initialConnectionId: connectionId,
        onPublished: () => { void surface.load(surface.getCurrentPath()); }
      }), actions: [{ id: 'close', label: 'Close', variant: 'ghost' }] });
    }
  });

  el.innerHTML = '';
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.minHeight = '0';
  el.style.overflow = 'hidden';
  surface.element.style.flex = '1';
  surface.element.style.minHeight = '0';
  surface.element.style.height = 'auto';
  el.appendChild(surface.element);
}
