import { fetchPartial } from './fetchPartial.js';
import { initBuilder } from './builderRenderer.js';
import { enableAutoEdit } from './editor/editor.js';
import { sanitizeHtml } from '../../public/plainspace/sanitizer.js';
import { initBuilderPanel } from './managers/panelManager.js';
import { applyUserColor } from '../../public/assets/js/userColor.js';

let bootstrapped = false;


async function bootstrap() {
  if (bootstrapped) return;
  bootstrapped = true;
  await applyUserColor(true);
  const sidebarEl = document.getElementById('sidebar');
  const contentEl = document.getElementById('builderMain');
  const rowEl = document.getElementById('builderRow');
  try {
    sidebarEl.innerHTML = sanitizeHtml(await fetchPartial('sidebar-builder'));
    let panelContainer = null;
    try {
      const panelHtml = await fetchPartial('builder-panel');
      const tpl = document.createElement('template');
      tpl.innerHTML = sanitizeHtml(panelHtml);
      panelContainer = tpl.content.firstElementChild;
      if (panelContainer && rowEl) {
        rowEl.insertBefore(panelContainer, document.getElementById('content'));
        const textHtml = await fetchPartial('text-panel', 'builder');
        panelContainer.innerHTML = sanitizeHtml(textHtml);
        try {
          const colorHtml = await fetchPartial('color-panel', 'builder');
          panelContainer.insertAdjacentHTML('beforeend', sanitizeHtml(colorHtml));
          const colorPanel = panelContainer.querySelector('.color-panel');
          if (colorPanel) colorPanel.style.display = 'none';
        } catch (e) {
          console.warn('[Designer App] Failed to load color panel:', e);
        }

      }
    } catch (e) {
      console.error('[Designer App] Failed to load builder panel:', e);
    }
    initBuilderPanel();
  } catch (err) {
    console.error('[Designer App] Failed to load sidebar:', err);
  }

  const urlParams = new URLSearchParams(window.location.search);
  const designId = urlParams.get('designId');
  const layoutNameParam = urlParams.get('layout') || null;
  const layerParam = parseInt(urlParams.get('layer'), 10);
  const startLayer = Number.isFinite(layerParam) ? layerParam : 1;

  if (designId) {
    document.body.dataset.designId = designId;
  }
  const dvParam = parseInt(urlParams.get('designVersion'), 10);
  if (!Number.isNaN(dvParam)) {
    document.body.dataset.designVersion = String(dvParam);
  }

  await initBuilder(sidebarEl, contentEl, null, startLayer, layoutNameParam);
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
