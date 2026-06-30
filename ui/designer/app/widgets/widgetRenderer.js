import { addHitLayer, executeJs } from '../utils.js';
import { registerElement } from '../editor/editor.js';
import { emitAdminFacade } from '../runtime/runtimeFacade.js';
import { normalizeWidgetApiActions } from '../../../widgets/rendering/widgetEvents.js';

async function registerWidgetEvents(widgetDef) {
  if (typeof window.meltdownEmit !== 'function') return;
  const actions = normalizeWidgetApiActions(widgetDef?.metadata || {});
  if (!actions.length) return;
  const jwt = window.ADMIN_TOKEN || window.PUBLIC_TOKEN;
  if (!jwt) return;
  try {
    await emitAdminFacade(window.meltdownEmit, 'widgets', 'registerUsage', { actions });
  } catch (err) {
    console.warn('[Designer] registerWidgetUsage failed for', widgetDef.id, err);
  }
}

function hasInlineWidgetCode(data) {
  return Boolean(data && (
    typeof data.html === 'string' && data.html.trim() ||
    typeof data.css === 'string' && data.css.trim() ||
    typeof data.js === 'string' && data.js.trim()
  ));
}

function parseWidgetMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function instanceMetadataFromCode(data) {
  if (!data) return {};
  return {
    ...parseWidgetMetadata(data.metadata),
    ...parseWidgetMetadata(data.meta)
  };
}

export async function renderWidget(wrapper, widgetDef, codeMap, customData = null) {
  const instanceId = wrapper.dataset.instanceId;
  const data = customData || (codeMap && codeMap[instanceId]) || null;
  const content = wrapper.querySelector('.canvas-item-content');
  if (!content) {
  console.error('[renderWidget] .canvas-item-content not found for', widgetDef.id);
  return;
}
  content.innerHTML = '';
  const root = content;
  while (root.firstChild) root.removeChild(root.firstChild);

  const container = document.createElement('div');
  container.className = 'widget-container';
  container.classList.add('admin-widget');
  container.style.width = '100%';
  container.style.height = '100%';

  const stop = ev => {
    const t = ev.target.closest('input, textarea, select, label, button');
    if (t) {
      ev.stopPropagation();
      ev.stopImmediatePropagation();
    }
  };
  container.addEventListener('pointerdown', stop, true);
  container.addEventListener('mousedown', stop, true);
  container.addEventListener('touchstart', stop, { capture: true, passive: true });
  content.addEventListener('pointerdown', stop, true);
  content.addEventListener('mousedown', stop, true);
  content.addEventListener('touchstart', stop, { capture: true, passive: true });
  root.appendChild(container);

  await registerWidgetEvents(widgetDef);

  if (hasInlineWidgetCode(data)) {
    if (data.css) {
      const customStyle = document.createElement('style');
      customStyle.textContent = data.css;
      root.appendChild(customStyle);
    }
    if (data.html) {
      container.innerHTML = data.html;
      container.querySelectorAll('.editable').forEach(el => {
        registerElement(el);
        console.log('[DEBUG] registered editable in loaded widget', el);
      });
    }
    if (data.js) {
      try { executeJs(data.js, wrapper, root); } catch (e) { console.error('[Designer] custom js error', e); }
    }
    return;
  }
  const ctx = {
    id: instanceId,
    widgetId: widgetDef.id,
    metadata: widgetDef.metadata,
    instanceMetadata: instanceMetadataFromCode(data),
    scene: {
      behavior: wrapper.dataset.behavior || '',
      sceneId: wrapper.dataset.sceneId || '',
      sceneTitle: wrapper.dataset.sceneTitle || '',
      sceneBackground: wrapper.dataset.sceneBackground || '',
      scrollStart: wrapper.dataset.scrollStart || '',
      scrollEnd: wrapper.dataset.scrollEnd || ''
    }
  };
  if (window.ADMIN_TOKEN) ctx.jwt = window.ADMIN_TOKEN;
  const codeUrl = new URL(widgetDef.codeUrl, document.baseURI).href;
  try {
    const m = await import(/* webpackIgnore: true */ codeUrl);
    m.render?.(container, ctx);
  } catch (err) {
    console.error('[Designer] widget import error', err);
  }

  if (widgetDef.id === 'textBox') addHitLayer(wrapper);
}
