import { fetchPartial } from './fetchPartial.js';
import { initBuilder } from './builderRenderer.js';
import { enableAutoEdit } from './editor/editor.js';
import { sanitizeHtml } from '../../public/plainspace/sanitizer.js';
import { initBuilderPanel } from './managers/panelManager.js';
import { applyUserColor } from '../../public/assets/js/userColor.js';

let bootstrapped = false;
const urlParams = new URLSearchParams(window.location.search);

const allowedOrigins = new Set();

const normalizeOrigin = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw || raw.toLowerCase() === 'null') {
    return null;
  }
  try {
    const url = new URL(raw, window.location.href);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.origin;
    }
    return null;
  } catch (_) {
    return null;
  }
};

const getPrimaryAllowedOrigin = () => {
  const first = allowedOrigins.values().next();
  return first.done ? window.location.origin : first.value;
};

let parentPostMessageOrigin = window.location.origin;

const addAllowedOrigins = (origins) => {
  if (!Array.isArray(origins)) return;
  let changed = false;
  origins.forEach((originValue) => {
    const normalized = normalizeOrigin(originValue);
    if (normalized && !allowedOrigins.has(normalized)) {
      allowedOrigins.add(normalized);
      changed = true;
    }
  });
  if (changed) {
    parentPostMessageOrigin = getPrimaryAllowedOrigin();
  }
};

const isAllowedOrigin = (origin) => {
  const normalized = normalizeOrigin(origin);
  return normalized ? allowedOrigins.has(normalized) : false;
};

const initialAllowedParam = urlParams.get('allowedOrigins');
if (initialAllowedParam) {
  addAllowedOrigins(initialAllowedParam.split(','));
}
if (!allowedOrigins.size) {
  addAllowedOrigins([window.location.origin]);
} else {
  parentPostMessageOrigin = getPrimaryAllowedOrigin();
}


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

  window.parent.postMessage({ type: 'designer-ready' }, parentPostMessageOrigin);
}

function maybeBootstrap() {
  if (window.CSRF_TOKEN && typeof window.ADMIN_TOKEN !== 'undefined' && document.readyState !== 'loading') {
    bootstrap();
  }
}

window.addEventListener('message', (e) => {
  const msg = e.data || {};
  if (!isAllowedOrigin(e.origin)) {
    return;
  }
  if (msg.type === 'init-tokens') {
    const respondingOrigin = normalizeOrigin(e.origin);
    if (Array.isArray(msg.allowedOrigins)) {
      addAllowedOrigins(msg.allowedOrigins);
    } else if (typeof msg.allowedOrigin === 'string') {
      addAllowedOrigins([msg.allowedOrigin]);
    }
    window.CSRF_TOKEN = msg.csrfToken;
    window.ADMIN_TOKEN = msg.adminToken;
    if (respondingOrigin && allowedOrigins.has(respondingOrigin)) {
      parentPostMessageOrigin = respondingOrigin;
    }
    maybeBootstrap();
  } else if (msg.type === 'refresh') {
    window.location.reload();
  }
});

document.addEventListener('DOMContentLoaded', maybeBootstrap);
