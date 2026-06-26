import { getWidgetIcon } from '../renderer/renderUtils.js';
import { attachEditButton, attachRemoveButton, attachLockOnClick, attachResizeButton } from '../renderer/widgetActions.js';
import { attachOptionsMenu } from '../widgets/widgetMenu.js';
import { renderWidget } from '../widgets/widgetRenderer.js';

function parseEffects(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(effect => effect && typeof effect === 'object');
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed)
      ? parsed.filter(effect => effect && typeof effect === 'object')
      : [];
  } catch {
    return [];
  }
}

function readAppearanceValue(item, meta, keys) {
  for (const key of keys) {
    const value = item?.[key] ?? meta?.[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return '';
}

function normalizeOpacity(value) {
  if (value === null || value === undefined || value === '') return null;
  const raw = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(raw)) return null;
  const ratio = raw > 1 ? raw / 100 : raw;
  return Math.max(0, Math.min(1, ratio));
}

function normalizeRadius(value) {
  if (value === null || value === undefined || value === '') return null;
  const raw = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : null;
}

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
    let itemMeta = item.code?.meta && typeof item.code.meta === 'object'
      ? item.code.meta
      : {};
    if (!Object.keys(itemMeta).length && item.code?.metadata) {
      if (typeof item.code.metadata === 'object') {
        itemMeta = item.code.metadata;
      } else if (typeof item.code.metadata === 'string') {
        try {
          const parsedMeta = JSON.parse(item.code.metadata);
          if (parsedMeta && typeof parsedMeta === 'object') itemMeta = parsedMeta;
        } catch {
          itemMeta = {};
        }
      }
    }
    const behavior = item.behavior || itemMeta.behavior || 'scroll';
    const sceneId = item.sceneId || itemMeta.sceneId || '';
    const sceneTitle = item.sceneTitle || itemMeta.sceneTitle || '';
    const sceneBackground = item.sceneBackground || itemMeta.sceneBackground || '';
    const scrollStart = item.scrollStart || itemMeta.scrollStart || '';
    const scrollEnd = item.scrollEnd || itemMeta.scrollEnd || '';
    const elementName = readAppearanceValue(item, itemMeta, ['elementName', 'element_name', 'name']);
    const opacity = readAppearanceValue(item, itemMeta, ['opacity']);
    const radius = readAppearanceValue(item, itemMeta, ['radius', 'cornerRadius', 'corner_radius']);
    const effects = parseEffects(item.effects || itemMeta.effects);
    if (item.code) {
      codeMap[instId] = {
        ...item.code,
        meta: {
          ...itemMeta,
          ...(behavior ? { behavior } : {}),
          ...(sceneId ? { sceneId } : {}),
          ...(sceneTitle ? { sceneTitle } : {}),
          ...(sceneBackground ? { sceneBackground } : {}),
          ...(scrollStart ? { scrollStart } : {}),
          ...(scrollEnd ? { scrollEnd } : {}),
          ...(elementName ? { elementName } : {}),
          ...(opacity !== '' ? { opacity } : {}),
          ...(radius !== '' ? { radius } : {}),
          ...(effects.length ? { effects } : {})
        }
      };
    }
    const wrapper = document.createElement('div');
    wrapper.classList.add('canvas-item');
    wrapper.id = `widget-${instId}`;
    wrapper.dataset.widgetId = widgetDef.id;
    wrapper.dataset.instanceId = instId;
    wrapper.dataset.global = isGlobal ? 'true' : 'false';
    wrapper.dataset.layer = String(layerIndex);
    wrapper.dataset.behavior = behavior;
    if (sceneId) wrapper.dataset.sceneId = sceneId;
    if (sceneTitle) wrapper.dataset.sceneTitle = sceneTitle;
    if (sceneBackground) wrapper.dataset.sceneBackground = sceneBackground;
    if (scrollStart) wrapper.dataset.scrollStart = scrollStart;
    if (scrollEnd) wrapper.dataset.scrollEnd = scrollEnd;
    if (elementName) wrapper.dataset.elementName = String(elementName);
    if (opacity !== '') {
      wrapper.dataset.opacity = String(opacity);
      const opacityValue = normalizeOpacity(opacity);
      if (opacityValue !== null) wrapper.style.opacity = String(opacityValue);
    }
    if (radius !== '') wrapper.dataset.radius = String(radius);
    if (effects.length) wrapper.dataset.effects = JSON.stringify(effects);
    const cols = grid?.options?.columns || 12;
    const cellH = grid?.options?.cellHeight || 1;
    const gridH = gridEl?.getBoundingClientRect().height || 1;
    const rows = gridH / cellH;
    const x = item.xPercent != null ? Math.round((item.xPercent / 100) * cols) : (item.x ?? 0);
    const y = item.yPercent != null ? Math.round((item.yPercent / 100) * rows) : (item.y ?? 0);
    const w = item.wPercent != null ? Math.max(1, Math.round((item.wPercent / 100) * cols)) : (item.w ?? 4);
    const h = item.hPercent != null ? Math.max(1, Math.round((item.hPercent / 100) * rows)) : (item.h ?? DEFAULT_ROWS);
    wrapper.dataset.x = x;
    wrapper.dataset.y = y;
    wrapper.style.zIndex = layerIndex.toString();
    wrapper.setAttribute('gs-w', w);
    wrapper.setAttribute('gs-h', h);
    wrapper.setAttribute('gs-min-w', 1);
    wrapper.setAttribute('gs-min-h', DEFAULT_ROWS);
    const content = document.createElement('div');
    content.className = 'canvas-item-content builder-themed';
    content.innerHTML = `${getWidgetIcon(widgetDef, iconMap)}<span>${widgetDef.metadata?.label || widgetDef.id}</span>`;
    const radiusValue = normalizeRadius(radius);
    if (radiusValue !== null) content.style.borderRadius = `${radiusValue}px`;
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
  const instanceId = el.dataset.instanceId;
  const existingCode = instanceId ? codeMap[instanceId] : null;
  const code = existingCode && typeof existingCode === 'object'
    ? { ...existingCode }
    : {};
  const meta = code.meta && typeof code.meta === 'object'
    ? { ...code.meta }
    : {};
  if (el.dataset.sceneId) meta.sceneId = el.dataset.sceneId;
  if (el.dataset.behavior) meta.behavior = el.dataset.behavior;
  if (el.dataset.sceneTitle) meta.sceneTitle = el.dataset.sceneTitle;
  if (el.dataset.sceneBackground) meta.sceneBackground = el.dataset.sceneBackground;
  if (el.dataset.scrollStart) meta.scrollStart = el.dataset.scrollStart;
  if (el.dataset.scrollEnd) meta.scrollEnd = el.dataset.scrollEnd;
  if (el.dataset.elementName) meta.elementName = el.dataset.elementName;
  if (el.dataset.opacity) meta.opacity = el.dataset.opacity;
  if (el.dataset.radius) meta.radius = el.dataset.radius;
  const effects = parseEffects(el.dataset.effects);
  if (effects.length) meta.effects = effects;
  if (Object.keys(meta).length) code.meta = meta;
  return {
    widgetId: el.dataset.widgetId,
    global: el.dataset.global === 'true',
    behavior: el.dataset.behavior || meta.behavior || 'scroll',
    sceneId: el.dataset.sceneId || meta.sceneId || '',
    sceneTitle: el.dataset.sceneTitle || meta.sceneTitle || '',
    sceneBackground: el.dataset.sceneBackground || meta.sceneBackground || '',
    scrollStart: el.dataset.scrollStart || meta.scrollStart || '',
    scrollEnd: el.dataset.scrollEnd || meta.scrollEnd || '',
    elementName: el.dataset.elementName || meta.elementName || '',
    opacity: el.dataset.opacity || meta.opacity || '',
    radius: el.dataset.radius || meta.radius || '',
    effects: effects.length ? effects : (Array.isArray(meta.effects) ? meta.effects : []),
    w: +el.getAttribute('gs-w'),
    h: +el.getAttribute('gs-h'),
    code: Object.keys(code).length ? code : null
  };
}
