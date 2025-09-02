import { fetchPartial } from './fetchPartial.js';
import { initBuilder } from './builderRenderer.js';
import { enableAutoEdit } from './editor/editor.js';
import { sanitizeHtml } from '../../public/plainspace/sanitizer.js';

let bootstrapped = false;

async function bootstrap() {
  if (bootstrapped) return;
  bootstrapped = true;
  const sidebarEl = document.getElementById('sidebar');
  const contentEl = document.getElementById('builderMain');
  try {
    sidebarEl.innerHTML = sanitizeHtml(await fetchPartial('sidebar-builder'));
    const panelContainer = document.getElementById('builderPanel');
    if (panelContainer) {
      const textHtml = await fetchPartial('text-panel', 'builder');
      panelContainer.innerHTML = sanitizeHtml(textHtml);
      // Preload color panel (kept hidden until opened from toolbar)
      try {
        const colorHtml = await fetchPartial('color-panel', 'builder');
        panelContainer.insertAdjacentHTML('beforeend', sanitizeHtml(colorHtml));
        const colorPanel = panelContainer.querySelector('.color-panel');
        if (colorPanel) colorPanel.style.display = 'none';
      } catch (e) {
        console.warn('[Designer App] Failed to load color panel:', e);
      }
    }
  } catch (err) {
    console.error('[Designer App] Failed to load sidebar:', err);
  }

  const urlParams = new URLSearchParams(window.location.search);
  const pageId = urlParams.get('pageId');
  const layoutNameParam = urlParams.get('layout') || null;
  const layerParam = parseInt(urlParams.get('layer'), 10);
  const startLayer = Number.isFinite(layerParam) ? layerParam : (layoutNameParam ? 1 : 0);

  await initBuilder(sidebarEl, contentEl, pageId, startLayer, layoutNameParam);
  enableAutoEdit();

  window.parent.postMessage({ type: 'designer-ready' }, '*');
}

function maybeBootstrap() {
  if (window.CSRF_TOKEN && typeof window.ADMIN_TOKEN !== 'undefined' && document.readyState !== 'loading') {
    bootstrap();
  }
}

window.addEventListener('message', (e) => {
  const msg = e.data || {};
  if (msg.type === 'init-tokens') {
    window.CSRF_TOKEN = msg.csrfToken;
    window.ADMIN_TOKEN = msg.adminToken;
    maybeBootstrap();
  } else if (msg.type === 'refresh') {
    window.location.reload();
  }
});

document.addEventListener('DOMContentLoaded', maybeBootstrap);
