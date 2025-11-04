import { STRINGS } from '../i18n.js';
import { fetchPartial } from '../fetchPartial.js';
import { sanitizeHtml } from '../../../public/plainspace/sanitizer.js';
import { getWidgetIcon } from './renderUtils.js';

let widgetsPanelTemplate = '';
let layoutPanelHtml = null;

export function initLayoutMode(sidebarEl) {
  widgetsPanelTemplate = sidebarEl.innerHTML;
}

export function populateWidgetsPanel(sidebarEl, allWidgets, iconMap = {}, switchToLayout) {
  sidebarEl.innerHTML = widgetsPanelTemplate;
  const dragWrap = sidebarEl.querySelector('.drag-icons');
  if (dragWrap) {
    dragWrap.innerHTML = allWidgets.map(w => `
    <div class="sidebar-item drag-widget-icon" draggable="true" data-widget-id="${w.id}">
      ${getWidgetIcon(w, iconMap)}
      <span class="label">${w.metadata.label}</span>
    </div>
  `).join('');

    if (typeof switchToLayout === 'function') {
      const layoutSwitcher = document.createElement('div');
      layoutSwitcher.className = 'sidebar-item layout-switcher';
      layoutSwitcher.innerHTML = `${window.featherIcon ? window.featherIcon('panels-top-left') : ''}<span class="label">${STRINGS.layoutEditor}</span>`;
      layoutSwitcher.setAttribute('draggable', 'false');
      layoutSwitcher.addEventListener('click', switchToLayout);
      dragWrap.prepend(layoutSwitcher);
    }

    dragWrap.querySelectorAll('.drag-widget-icon').forEach(icon => {
      icon.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', icon.dataset.widgetId);
      });
    });
  }
}

async function showLayoutPanel(sidebarEl) {
  if (!layoutPanelHtml) {
    try {
      layoutPanelHtml = sanitizeHtml(await fetchPartial('layout-panel'));
    } catch {
      layoutPanelHtml = '<nav class="sidebar-nav layout-panel"></nav>';
    }
  }
  sidebarEl.innerHTML = layoutPanelHtml;
  const titleEl = sidebarEl.querySelector('.layout-panel-title');
  if (titleEl) titleEl.textContent = STRINGS.layoutPanelTitle;
  const soonEl = sidebarEl.querySelector('.layout-panel-coming-soon');
  if (soonEl) soonEl.textContent = STRINGS.layoutPanelComingSoon;
  const arrangeText = sidebarEl.querySelector('.arrange-label-text');
  if (arrangeText) arrangeText.textContent = STRINGS.arrangeMode;
}

export async function startLayoutMode(ctx) {
  await showLayoutPanel(ctx.sidebarEl);
  ctx.hideToolbar();
  if (ctx.gridEl) ctx.gridEl.style.pointerEvents = 'none';
  try { ctx.refreshContainerBars?.(); } catch { }
  try { ctx.refreshLayoutTree?.(); } catch { }
}

export function stopLayoutMode(ctx) {
  populateWidgetsPanel(ctx.sidebarEl, ctx.allWidgets, ctx.ICON_MAP, () => ctx.switchLayer(0));
  if (ctx.gridEl) ctx.gridEl.style.pointerEvents = '';
  ctx.showToolbar();
}
