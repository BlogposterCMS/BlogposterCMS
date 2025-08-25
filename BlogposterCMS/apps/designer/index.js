import { fetchPartial } from '../../public/plainspace/dashboard/fetchPartial.js';
import { initBuilder } from '../../public/plainspace/builderRenderer.js';
import { enableAutoEdit, sanitizeHtml } from '../../public/plainspace/editor/editor.js';

let bootstrapped = false;

async function bootstrap() {
  if (bootstrapped) return;
  bootstrapped = true;
  const sidebarEl = document.getElementById('sidebar');
  const contentEl = document.getElementById('content');
  try {
    sidebarEl.innerHTML = sanitizeHtml(await fetchPartial('sidebar-builder'));
    const panelContainer = sidebarEl.querySelector('#builderPanel');
    if (panelContainer) {
      const textHtml = await fetchPartial('text-panel', 'builder');
      panelContainer.innerHTML = sanitizeHtml(textHtml);
    }
  } catch (err) {
    console.error('[Builder App] Failed to load sidebar:', err);
  }

  const urlParams = new URLSearchParams(window.location.search);
  const pageId = urlParams.get('pageId');
  const layoutNameParam = urlParams.get('layout') || null;
  const layerParam = parseInt(urlParams.get('layer'), 10);
  const startLayer = Number.isFinite(layerParam) ? layerParam : (layoutNameParam ? 1 : 0);

  await initBuilder(sidebarEl, contentEl, pageId, startLayer, layoutNameParam);
  enableAutoEdit();

  window.parent.postMessage({ type: 'builder-ready' }, '*');
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
