import { enterSplitMode } from '../modes/splitMode.js';
import { showBuilderPanel, hideBuilderPanel } from '../../managers/panelManager.js';
import { fetchPartial } from '../../fetchPartial.js';
import { sanitizeHtml } from '../../../../public/plainspace/sanitizer.js';

let panel;
let initialized = false;

async function ensurePanel() {
  if (panel) return panel;
  const container = document.getElementById('builderPanel');
  if (!container) return null;
  panel = container.querySelector('.layout-panel');
  if (!panel) {
    try {
      const html = await fetchPartial('layout-panel', 'builder');
      container.insertAdjacentHTML('beforeend', sanitizeHtml(html));
      panel = container.querySelector('.layout-panel');
    } catch (e) {
      console.warn('[LayoutPanel] Failed to load layout panel:', e);
      return null;
    }
  }
  if (panel && !initialized) {
    const useBtn = panel.querySelector('.layout-use-current');
    const newBtn = panel.querySelector('.layout-create-new');
    const close = panel.querySelector('.collapse-btn');
    const handle = () => {
      hideBuilderPanel();
      const ctx = panel._ctx || {};
      if (ctx.rootEl) enterSplitMode({ rootEl: ctx.rootEl, onChange: ctx.onChange });
    };
    useBtn?.addEventListener('click', handle);
    newBtn?.addEventListener('click', handle);
    close?.addEventListener('click', () => hideBuilderPanel());
    initialized = true;
  }
  return panel;
}

export async function showLayoutPanel({ rootEl, onChange } = {}) {
  const el = await ensurePanel();
  if (!el) return;
  el._ctx = { rootEl, onChange };
  showBuilderPanel('layout-panel');
}

