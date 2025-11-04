import { fetchPartial } from './fetchPartial.js';
import { initBuilder } from './builderRenderer.js';
import { enableAutoEdit } from './editor/editor.js';
import { sanitizeHtml } from '../../public/plainspace/sanitizer.js';
import { initBuilderPanel } from './managers/panelManager.js';
import { applyUserColor } from '../../public/assets/js/userColor.js';

const LOADER_VARIANTS = {
  sidebar: { className: 'designer-loader--sidebar', lines: 6 },
  panel: { className: 'designer-loader--panel', lines: 4 },
  section: { className: 'designer-loader--section', lines: 3 }
};

const createLoaderElement = (variantKey = 'section') => {
  const variant = LOADER_VARIANTS[variantKey] || LOADER_VARIANTS.section;
  const loader = document.createElement('div');
  loader.classList.add('designer-loader', variant.className);
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');

  const srLabel = document.createElement('span');
  srLabel.className = 'designer-sr-only';
  srLabel.textContent = 'Loading content';
  loader.appendChild(srLabel);

  const lines = Number.isFinite(variant.lines) ? variant.lines : 3;
  for (let i = 0; i < lines; i += 1) {
    const bar = document.createElement('span');
    bar.className = 'designer-loader__bar';
    const width = Math.max(40, 100 - (i * 12));
    bar.style.setProperty('--loader-bar-width', `${width}%`);
    bar.style.setProperty('--loader-bar-delay', `${i * 0.08}s`);
    loader.appendChild(bar);
  }

  return loader;
};

const attachLoader = ({ container, before, variant = 'section' }) => {
  if (!container && !before) {
    return { remove: () => {}, element: null };
  }

  const loader = createLoaderElement(variant);
  if (before && before.parentElement) {
    before.parentElement.insertBefore(loader, before);
  } else if (container) {
    container.appendChild(loader);
  }

  const remove = () => {
    if (loader.isConnected) {
      loader.remove();
    }
  };

  return { remove, element: loader };
};

const renderLoadError = ({
  container,
  before,
  message,
  title = 'Unable to load content',
  variant = 'section',
  replace = false
}) => {
  if (!container && !before) {
    return null;
  }

  const error = document.createElement('div');
  error.classList.add('designer-load-error', `designer-load-error--${variant}`);
  error.setAttribute('role', 'alert');
  error.setAttribute('aria-live', 'assertive');

  const heading = document.createElement('p');
  heading.className = 'designer-load-error__title';
  heading.textContent = title;
  const description = document.createElement('p');
  description.className = 'designer-load-error__message';
  description.textContent = message;

  error.append(heading, description);

  if (replace && container) {
    container.replaceChildren(error);
  } else if (before && before.parentElement) {
    before.parentElement.insertBefore(error, before);
  } else if (container) {
    container.appendChild(error);
  }

  return error;
};

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
  if (!sidebarEl || !contentEl || !rowEl) {
    console.error('[Designer App] Missing required layout containers.');
    return;
  }
  const sidebarLoader = attachLoader({ container: sidebarEl, variant: 'sidebar' });
  try {
    const sidebarMarkup = await fetchPartial('sidebar-builder');
    sidebarEl.innerHTML = sanitizeHtml(sidebarMarkup);
  } catch (err) {
    console.error('[Designer App] Failed to load sidebar:', err);
    renderLoadError({
      container: sidebarEl,
      message: 'The builder sidebar could not be loaded. Please refresh the page.',
      title: 'Sidebar unavailable',
      variant: 'sidebar',
      replace: true
    });
  } finally {
    sidebarLoader.remove();
  }

  let panelContainer = null;
  const contentAnchor = document.getElementById('content');
  const panelLoader = attachLoader({ container: rowEl, before: contentAnchor, variant: 'panel' });
  try {
    const panelHtml = await fetchPartial('builder-panel');
    const tpl = document.createElement('template');
    tpl.innerHTML = sanitizeHtml(panelHtml);
    panelContainer = tpl.content.firstElementChild;
    if (panelContainer && rowEl) {
      panelLoader.remove();
      rowEl.insertBefore(panelContainer, contentAnchor);
      let textPanelLoaded = false;
      const textLoader = attachLoader({ container: panelContainer, variant: 'section' });
      try {
        const textHtml = await fetchPartial('text-panel', 'builder');
        panelContainer.innerHTML = sanitizeHtml(textHtml);
        textPanelLoaded = true;
      } catch (e) {
        console.error('[Designer App] Failed to load text tools panel:', e);
        renderLoadError({
          container: panelContainer,
          message: 'The text tools panel is unavailable right now. Reload the designer to try again.',
          title: 'Text panel unavailable',
          variant: 'section',
          replace: true
        });
      } finally {
        textLoader.remove();
      }

      if (textPanelLoaded) {
        const colorLoader = attachLoader({ container: panelContainer, variant: 'section' });
        try {
          const colorHtml = await fetchPartial('color-panel', 'builder');
          panelContainer.insertAdjacentHTML('beforeend', sanitizeHtml(colorHtml));
          const colorPanel = panelContainer.querySelector('.color-panel');
          if (colorPanel) colorPanel.style.display = 'none';
        } catch (e) {
          console.warn('[Designer App] Failed to load color panel:', e);
          renderLoadError({
            container: panelContainer,
            message: 'Color controls could not be loaded. Some styling actions may be unavailable.',
            title: 'Color panel unavailable',
            variant: 'section'
          });
        } finally {
          colorLoader.remove();
        }
      }
    }
  } catch (e) {
    console.error('[Designer App] Failed to load builder panel:', e);
    panelLoader.remove();
    renderLoadError({
      container: rowEl,
      before: contentAnchor,
      message: 'The builder controls failed to load. Try refreshing the page.',
      title: 'Builder panel unavailable',
      variant: 'panel'
    });
  } finally {
    panelLoader.remove();
  }

  initBuilderPanel();

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
