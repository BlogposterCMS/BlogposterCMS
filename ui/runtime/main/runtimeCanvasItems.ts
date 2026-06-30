import {
  applyItemAppearance,
  applySceneMetadata,
  normalizeRuntimeOpacity
} from './sceneRuntime.js';
import {
  hasSceneMotion,
  registerSceneEffects,
  requestSceneEffectUpdate
} from './runtimeSceneEffects.js';
import {
  getRuntimeWidgetSizeContract,
  type RuntimeWidgetDefinition,
  type RuntimeWidgetSizeContract,
  type RuntimeWidgetSizeSlot
} from './runtimeWidgetTypes.js';
import { markRuntimeWidgetShell } from './runtimeWidgetHydration.js';

type LooseRecord = Record<string, any>;
const FULL_WIDGET_SIZE_SLOT = 'full';

export type RuntimeCanvasWidgetDefinition = RuntimeWidgetDefinition;

export type RuntimeCanvasItemMeta = LooseRecord;

export type RuntimeCanvasItemOptions = {
  def: RuntimeCanvasWidgetDefinition;
  item: RuntimeCanvasItemMeta;
  x: number | string;
  y: number | string;
  w: number | string;
  h: number | string;
  minW?: number | string;
  minH?: number | string;
  instanceId?: string;
  includeLayoutMetadata?: boolean;
};

export type RuntimeCanvasRect = {
  x: number | string;
  y: number | string;
  w: number | string;
  h: number | string;
};

export type RuntimeCanvasRectOptions = {
  scaleX: number;
  scaleY: number;
  percentDivisor?: number;
  defaultW?: number | string;
  defaultH?: number | string;
  def?: RuntimeCanvasWidgetDefinition;
  heightProjectionMode?: 'percent' | 'absoluteRowsAbovePercentRange';
};

export type RuntimeCanvasItem = {
  wrapper: HTMLElement;
  placeholder: HTMLElement;
};

function parseFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(num) ? num : null;
}

function copyPercentDataset(
  wrapper: HTMLElement,
  item: RuntimeCanvasItemMeta,
  key: 'xPercent' | 'yPercent' | 'wPercent' | 'hPercent'
): void {
  if (item[key] != null) wrapper.dataset[key] = String(item[key]);
}

function applyRuntimeStyleSourceMetadata(wrapper: HTMLElement, item: RuntimeCanvasItemMeta): void {
  const styleSource = item.styleSource || item.style_source || item.code?.meta?.styleSource || item.code?.meta?.style_source;
  if (!styleSource || typeof styleSource !== 'object' || Array.isArray(styleSource)) return;
  if (styleSource.enabled !== undefined) wrapper.dataset.styleSourceEnabled = String(styleSource.enabled);
  if (styleSource.role) wrapper.dataset.styleSourceRole = String(styleSource.role);
  if (styleSource.sourceId) wrapper.dataset.styleSourceId = String(styleSource.sourceId);
  if (styleSource.syncLayout !== undefined) wrapper.dataset.styleSyncLayout = String(styleSource.syncLayout);
  if (styleSource.syncDesign !== undefined) wrapper.dataset.styleSyncDesign = String(styleSource.syncDesign);
}

function projectPercent(
  value: unknown,
  scale: number,
  divisor: number,
  minOne = false
): number {
  const raw = Number(value) || 0;
  const projected = Math.round((raw / divisor) * scale);
  return minOne ? Math.max(1, projected) : projected;
}

function projectRuntimeHeight(
  value: unknown,
  scale: number,
  divisor: number,
  mode: RuntimeCanvasRectOptions['heightProjectionMode'] = 'percent'
): number {
  const raw = Number(value);
  if (mode === 'absoluteRowsAbovePercentRange' && Number.isFinite(raw) && raw > 100) {
    return Math.max(1, Math.round(raw));
  }
  return projectPercent(value, scale, divisor, true);
}

function projectRuntimeVerticalPosition(
  value: unknown,
  scale: number,
  divisor: number,
  mode: RuntimeCanvasRectOptions['heightProjectionMode'] = 'percent'
): number {
  const raw = Number(value);
  if (mode === 'absoluteRowsAbovePercentRange' && Number.isFinite(raw) && raw > 100) {
    return Math.max(0, Math.round(raw));
  }
  return projectPercent(value, scale, divisor);
}

function numberFitsSlot(value: number | null, min?: number, max?: number): boolean {
  if (value === null) return true;
  if (Number.isFinite(min) && value < Number(min)) return false;
  if (Number.isFinite(max) && value > Number(max)) return false;
  return true;
}

function slotMatchesRect(
  slot: RuntimeWidgetSizeSlot,
  width: number | null,
  height: number | null
): boolean {
  return (
    numberFitsSlot(width, slot.minCols, slot.maxCols) &&
    numberFitsSlot(height, slot.minRows, slot.maxRows)
  );
}

function pickRuntimeWidgetSlot(
  contract: RuntimeWidgetSizeContract,
  width: number | null,
  height: number | null
): RuntimeWidgetSizeSlot | null {
  const slots = Array.isArray(contract.supportedSlots)
    ? contract.supportedSlots
    : [];
  return slots.find(slot => (
    slot &&
    typeof slot.name === 'string' &&
    slotMatchesRect(slot, width, height)
  )) || null;
}

function isFullOnlyWidgetContract(contract: RuntimeWidgetSizeContract | null): boolean {
  const slots = Array.isArray(contract?.supportedSlots)
    ? contract.supportedSlots
    : [];
  return slots.length > 0 && slots.every(slot => slot?.name === FULL_WIDGET_SIZE_SLOT);
}

function applyRuntimeWidgetSizeContract(
  wrapper: HTMLElement,
  def: RuntimeCanvasWidgetDefinition,
  width: unknown,
  height: unknown
): void {
  const contract = getRuntimeWidgetSizeContract(def);
  if (!contract) return;

  if (contract.heightMode) {
    wrapper.dataset.widgetHeightMode = String(contract.heightMode);
  }

  const slot = pickRuntimeWidgetSlot(
    contract,
    parseFiniteNumber(width),
    parseFiniteNumber(height)
  );

  if (slot) {
    wrapper.dataset.widgetSizeSlot = slot.name;
    if (slot.name === FULL_WIDGET_SIZE_SLOT) {
      wrapper.dataset.widgetHeightMode = 'auto';
    }
    delete wrapper.dataset.widgetSizeError;
    return;
  }

  if (Array.isArray(contract.supportedSlots) && contract.supportedSlots.length) {
    wrapper.dataset.widgetSizeSlot = 'unsupported';
    wrapper.dataset.widgetSizeError = 'WIDGET_SIZE_UNSUPPORTED';
  }
}

export function resolveRuntimeCanvasRect(
  item: RuntimeCanvasItemMeta,
  {
    scaleX,
    scaleY,
    percentDivisor = 100,
    defaultW = 8,
    defaultH = 4,
    def,
    heightProjectionMode = 'percent'
  }: RuntimeCanvasRectOptions
): RuntimeCanvasRect {
  const rect = {
    x: item.xPercent !== undefined
      ? projectPercent(item.xPercent, scaleX, percentDivisor)
      : item.x ?? 0,
    y: item.yPercent !== undefined
      ? projectRuntimeVerticalPosition(item.yPercent, scaleY, percentDivisor, heightProjectionMode)
      : item.y ?? 0,
    w: item.wPercent !== undefined
      ? projectPercent(item.wPercent, scaleX, percentDivisor, true)
      : item.w ?? defaultW,
    h: item.hPercent !== undefined
      ? projectRuntimeHeight(item.hPercent, scaleY, percentDivisor, heightProjectionMode)
      : item.h ?? defaultH
  };

  const contract = def ? getRuntimeWidgetSizeContract(def) : null;
  if (!isFullOnlyWidgetContract(contract) || !Number.isFinite(scaleX) || scaleX <= 0) {
    return rect;
  }

  return {
    ...rect,
    x: 0,
    w: scaleX
  };
}

export function applyRuntimeLayoutMetadata(
  wrapper: HTMLElement,
  item: RuntimeCanvasItemMeta
): void {
  copyPercentDataset(wrapper, item, 'xPercent');
  copyPercentDataset(wrapper, item, 'yPercent');
  copyPercentDataset(wrapper, item, 'wPercent');
  copyPercentDataset(wrapper, item, 'hPercent');

  const layerRaw = item.layer != null
    ? item.layer
    : item.zIndex ?? item.z_index;
  const layerVal = parseFiniteNumber(layerRaw);
  if (layerVal !== null) wrapper.dataset.layer = String(layerVal);

  const rotationVal = parseFiniteNumber(item.rotationDeg ?? item.rotation_deg);
  if (rotationVal !== null) wrapper.dataset.rotationDeg = String(rotationVal);

  if (item.opacity != null) {
    const opacityVal = normalizeRuntimeOpacity(item.opacity);
    if (opacityVal !== null) wrapper.style.opacity = String(opacityVal);
  }
}

export function createWidgetPlaceholder(
  def: RuntimeCanvasWidgetDefinition
): HTMLElement {
  const placeholder = document.createElement('div');
  placeholder.className = 'widget-placeholder';
  placeholder.textContent = def.metadata?.label || def.id;
  return placeholder;
}

export function createRuntimeCanvasItem({
  def,
  item,
  x,
  y,
  w,
  h,
  minW = 4,
  minH = 4,
  instanceId = item.id,
  includeLayoutMetadata = false
}: RuntimeCanvasItemOptions): RuntimeCanvasItem {
  const wrapper = document.createElement('div');
  wrapper.classList.add('canvas-item', 'loading');
  wrapper.dataset.x = String(x);
  wrapper.dataset.y = String(y);
  wrapper.setAttribute('gs-w', String(w));
  wrapper.setAttribute('gs-h', String(h));
  wrapper.setAttribute('gs-min-w', String(minW));
  wrapper.setAttribute('gs-min-h', String(minH));
  wrapper.dataset.widgetId = def.id;
  wrapper.dataset.instanceId = String(instanceId);
  applyRuntimeStyleSourceMetadata(wrapper, item);

  applySceneMetadata(wrapper, item);
  registerSceneEffects(wrapper);
  if (includeLayoutMetadata) applyRuntimeLayoutMetadata(wrapper, item);
  applyRuntimeWidgetSizeContract(wrapper, def, w, h);

  const placeholder = createWidgetPlaceholder(def);
  wrapper.appendChild(placeholder);
  markRuntimeWidgetShell(wrapper, placeholder);
  return { wrapper, placeholder };
}

export function mountRuntimeCanvasContent(
  wrapper: HTMLElement,
  placeholder?: HTMLElement | null
): HTMLElement {
  const content = document.createElement('div');
  content.className = 'canvas-item-content';
  if (placeholder && placeholder.parentNode === wrapper) {
    placeholder.remove();
  }
  wrapper.appendChild(content);
  applyItemAppearance(wrapper);
  if (hasSceneMotion(wrapper)) requestSceneEffectUpdate();
  return content;
}
