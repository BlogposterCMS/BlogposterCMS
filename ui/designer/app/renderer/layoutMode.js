import { STRINGS } from '../i18n.js';
import { fetchPartial } from '../fetchPartial.js';
import { sanitizeHtml } from '/ui/shared/sanitize/sanitizer.js';
import { getWidgetIcon } from './renderUtils.js';

let widgetsPanelTemplate = '';
let layoutPanelHtml = null;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch] || ch));
}

function iconMarkup(icon) {
  const name = String(icon || 'square').replace(/[^a-z0-9_-]/gi, '');
  return `<img src="/assets/icons/${escapeHtml(name)}.svg" alt="" class="icon" />`;
}

function widgetAvailable(allWidgets, widgetId) {
  return !widgetId || allWidgets.some(widget => widget.id === widgetId);
}

function nativeAvailable(allWidgets, item) {
  if (!item?.nativeType) return true;
  if (item.nativeType === 'background') return true;
  if (!Array.isArray(item.preferredWidgetIds)) return true;
  return item.preferredWidgetIds.some(id => widgetAvailable(allWidgets, id));
}

function presetAvailable(allWidgets, preset) {
  return widgetAvailable(allWidgets, preset.widgetId) && nativeAvailable(allWidgets, preset);
}

function renderInsertGroups(sidebarEl, insertToolItems, allWidgets = []) {
  const groupWrap = sidebarEl.querySelector('.scene-native-elements');
  const panelWrap = sidebarEl.querySelector('.scene-insert-panels');
  if (!groupWrap || !panelWrap || !Array.isArray(insertToolItems)) return;

  const groups = insertToolItems
    .map(item => ({
      ...item,
      presets: (item.presets || []).filter(preset => presetAvailable(allWidgets, preset))
    }))
    .filter(item => item.presets.length || item.nativeType);

  groupWrap.innerHTML = groups.map(item => `
    <button
      type="button"
      class="scene-native-element scene-insert-group"
      data-insert-group="${escapeHtml(item.id)}"
      ${item.nativeType ? `data-native-element="${escapeHtml(item.nativeType)}" draggable="true"` : 'draggable="false"'}
      aria-expanded="false"
      title="${escapeHtml(item.title)}"
    >
      ${iconMarkup(item.icon)}
      <span>${escapeHtml(item.title)}</span>
    </button>
  `).join('');

  panelWrap.innerHTML = groups.map(item => `
    <section class="scene-insert-panel" data-insert-group-panel="${escapeHtml(item.id)}" hidden>
      <div class="scene-insert-panel-head">
        ${iconMarkup(item.icon)}
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.description || '')}</span>
        </div>
      </div>
      <div class="scene-insert-preset-list">
        ${item.presets.map(preset => `
          <button
            type="button"
            class="scene-insert-preset"
            data-insert-preset="${escapeHtml(preset.id)}"
            ${preset.nativeType ? `data-native-element="${escapeHtml(preset.nativeType)}"` : ''}
            ${preset.widgetId ? `data-widget-id="${escapeHtml(preset.widgetId)}"` : ''}
            draggable="true"
            title="${escapeHtml(preset.title)}"
          >
            ${iconMarkup(preset.icon || item.icon)}
            <span>${escapeHtml(preset.title)}</span>
            <small>${escapeHtml(preset.description || '')}</small>
          </button>
        `).join('')}
      </div>
    </section>
  `).join('');
}

export function initLayoutMode(sidebarEl) {
  widgetsPanelTemplate = sidebarEl.innerHTML;
}

export function populateWidgetsPanel(sidebarEl, allWidgets, iconMap = {}, switchToLayout, insertToolItems = []) {
  sidebarEl.innerHTML = widgetsPanelTemplate;
  renderInsertGroups(sidebarEl, insertToolItems, allWidgets);
  const dragWrap = sidebarEl.querySelector('.drag-icons');
  if (dragWrap) {
    const hasGroupedInsertPanel = Boolean(sidebarEl.querySelector('.scene-insert-panels'));
    const visibleWidgets = hasGroupedInsertPanel
      ? []
      : allWidgets.filter(w => !w.metadata?.hiddenFromCatalog);
    dragWrap.innerHTML = visibleWidgets.map(w => `
    <div class="sidebar-item drag-widget-icon" draggable="true" data-widget-id="${w.id}" title="${w.metadata.label}">
      ${getWidgetIcon(w, iconMap)}
      <span class="label">${w.metadata.label}</span>
    </div>
  `).join('');

    if (typeof switchToLayout === 'function' && !sidebarEl.querySelector('[data-sidebar-panel-target="layout"]')) {
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
  const layoutHost = sidebarEl.querySelector('.layout-panel-host');
  if (layoutHost && !layoutHost.querySelector('.layout-panel')) {
    layoutHost.innerHTML = layoutPanelHtml;
  } else if (!layoutHost) {
    sidebarEl.innerHTML = layoutPanelHtml;
  }
  const targetEl = layoutHost || sidebarEl;
  const titleEl = targetEl.querySelector('.layout-panel-title');
  if (titleEl) titleEl.textContent = STRINGS.layoutPanelTitle;
  const soonEl = targetEl.querySelector('.layout-panel-coming-soon');
  if (soonEl) soonEl.textContent = STRINGS.layoutPanelComingSoon;
  const arrangeText = targetEl.querySelector('.arrange-label-text');
  if (arrangeText) arrangeText.textContent = STRINGS.arrangeMode;
}

export async function startLayoutMode(ctx) {
  await showLayoutPanel(ctx.sidebarEl);
  ctx.setSidebarPanel?.('layout');
  ctx.hideToolbar();
  if (ctx.gridEl) ctx.gridEl.style.pointerEvents = 'none';
  try { ctx.refreshContainerBars?.(); } catch { }
  try { ctx.refreshLayoutTree?.(); } catch { }
}

export function stopLayoutMode(ctx) {
  // The rail shell owns the rendered section/layer panels; rebuilding it here
  // would erase those lists when leaving Layout mode.
  if (!ctx.sidebarEl.querySelector('.scene-panel-shell')) {
    populateWidgetsPanel(ctx.sidebarEl, ctx.allWidgets, ctx.ICON_MAP, () => ctx.switchLayer(0), ctx.INSERT_TOOL_ITEMS);
  }
  ctx.setSidebarPanel?.('insert');
  if (ctx.gridEl) ctx.gridEl.style.pointerEvents = '';
  ctx.showToolbar();
}
