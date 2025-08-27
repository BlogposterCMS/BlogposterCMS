import { getWidgetIcon } from '../renderer/renderUtils.js';
import { attachEditButton, attachRemoveButton, attachLockOnClick, attachResizeButton } from '../renderer/widgetActions.js';
import { attachOptionsMenu } from '../widgets/widgetMenu.js';
import { renderWidget } from '../widgets/widgetRenderer.js';

export function applyLayout(layout, {
  gridEl,
  grid,
  codeMap,
  allWidgets,
  layerIndex = 0,
  append = false,
  iconMap = {}
} = {}) {
  const DEFAULT_ROWS = 100;
  if (!append) {
    if (grid && typeof grid.removeAll === 'function') {
      grid.removeAll();
    } else {
      gridEl.innerHTML = '';
    }
    Object.keys(codeMap).forEach(k => delete codeMap[k]);
  }
  layout.forEach(item => {
    const widgetDef = allWidgets.find(w => w.id === item.widgetId);
    if (!widgetDef) return;
    const instId = item.id || `w${Math.random().toString(36).slice(2,8)}`;
    item.id = instId;
    const isGlobal = item.global === true;
    if (item.code) codeMap[instId] = item.code;
    const wrapper = document.createElement('div');
    wrapper.classList.add('canvas-item');
    wrapper.id = `widget-${instId}`;
    wrapper.dataset.widgetId = widgetDef.id;
    wrapper.dataset.instanceId = instId;
    wrapper.dataset.global = isGlobal ? 'true' : 'false';
    wrapper.dataset.layer = String(layerIndex);
    wrapper.dataset.x = item.x ?? 0;
    wrapper.dataset.y = item.y ?? 0;
    wrapper.style.zIndex = layerIndex.toString();
    wrapper.setAttribute('gs-w', item.w ?? 4);
    wrapper.setAttribute('gs-h', item.h ?? DEFAULT_ROWS);
    wrapper.setAttribute('gs-min-w', 1);
    wrapper.setAttribute('gs-min-h', DEFAULT_ROWS);
    const content = document.createElement('div');
    content.className = 'canvas-item-content builder-themed';
    content.innerHTML = `${getWidgetIcon(widgetDef, iconMap)}<span>${widgetDef.metadata?.label || widgetDef.id}</span>`;
    wrapper.appendChild(content);
    attachRemoveButton(wrapper, grid, null, () => {});
    attachResizeButton(wrapper, grid);
    const editBtn = attachEditButton(wrapper, widgetDef, codeMap, null, () => {});
    attachOptionsMenu(wrapper, widgetDef, editBtn, { grid, pageId: null, scheduleAutosave: () => {}, activeLayer: layerIndex, codeMap, genId: () => instId });
    attachLockOnClick(wrapper);
    gridEl.appendChild(wrapper);
  grid.makeWidget(wrapper);
  renderWidget(wrapper, widgetDef, codeMap);
  });
}

export function getItemData(el, codeMap) {
  return {
    widgetId: el.dataset.widgetId,
    global: el.dataset.global === 'true',
    w: +el.getAttribute('gs-w'),
    h: +el.getAttribute('gs-h'),
    code: codeMap[el.dataset.instanceId] || null
  };
}
