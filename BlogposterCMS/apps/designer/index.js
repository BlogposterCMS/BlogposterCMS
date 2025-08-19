import { fetchPartial } from '../../public/plainspace/dashboard/fetchPartial.js';
import { initBuilder } from '../../public/plainspace/builderRenderer.js';
import { enableAutoEdit, sanitizeHtml } from '../../public/plainspace/editor/editor.js';

async function bootstrap() {
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

window.addEventListener('message', (e) => {
  const msg = e.data || {};
  if (msg.type === 'refresh') {
    window.location.reload();
  }
});

document.addEventListener('DOMContentLoaded', bootstrap);
