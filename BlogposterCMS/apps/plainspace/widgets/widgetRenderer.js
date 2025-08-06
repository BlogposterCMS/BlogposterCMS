import { addHitLayer, executeJs } from '../utils.js';
import { registerElement } from '../editor/editor.js';

export function renderWidget(wrapper, widgetDef, codeMap, customData = null) {
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

  if (data) {
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
      try { executeJs(data.js, wrapper, root); } catch (e) { console.error('[Builder] custom js error', e); }
    }
    return;
  }
  const ctx = { id: instanceId, widgetId: widgetDef.id, metadata: widgetDef.metadata };
  if (window.ADMIN_TOKEN) ctx.jwt = window.ADMIN_TOKEN;
  const codeUrl = new URL(widgetDef.codeUrl, document.baseURI).href;
  import(/* webpackIgnore: true */ codeUrl)
    .then(m => m.render?.(container, ctx))
    .catch(err => console.error('[Builder] widget import error', err));

  if (widgetDef.id === 'textBox') addHitLayer(wrapper);
}
