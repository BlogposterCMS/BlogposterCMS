import { createMediaExplorerSurface } from '../../../shared/media/mediaExplorerSurface.js';

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
  el.appendChild(surface.element);
}
