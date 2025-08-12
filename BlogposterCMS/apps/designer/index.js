import { fetchPartial } from '../../public/plainspace/dashboard/fetchPartial.js';
import { initBuilder } from '../../public/plainspace/builderRenderer.js';
import { enableAutoEdit, sanitizeHtml } from '../../public/plainspace/editor/editor.js';

function loadStyle() {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/apps/designer/style.css';
  document.head.appendChild(link);
}

async function bootstrap() {
  loadStyle();
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

  const parts = window.location.pathname.split('/').filter(Boolean);
  const pageId = parts.length > 3 ? parts[3] : null;
  const urlParams = new URLSearchParams(window.location.search);
  const layoutNameParam = urlParams.get('layout') || null;
  const layerParam = parseInt(urlParams.get('layer'), 10);
  const startLayer = Number.isFinite(layerParam) ? layerParam : (layoutNameParam ? 1 : 0);

  await initBuilder(sidebarEl, contentEl, pageId, startLayer, layoutNameParam);
  enableAutoEdit();
}

document.addEventListener('DOMContentLoaded', bootstrap);
