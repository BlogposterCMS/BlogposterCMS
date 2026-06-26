import { coercePercent } from './widgetPercentSizing.js';

export interface WidgetOptionsMeta {
  debug?: boolean;
  max?: number | string;
  maxWidth?: number | string;
  maxHeight?: number | string;
  halfWidth?: boolean;
  thirdWidth?: boolean;
  width?: number;
  height?: number;
  overflow?: boolean;
}

export type WidgetDomOptionResult = {
  wPercent: number | null;
  hPercent: number | null;
};

function isFullAreaWidget(wrapper: HTMLElement): boolean {
  return wrapper.dataset.widgetSizeSlot === 'full';
}

function applyPercentStyle(
  wrapper: HTMLElement,
  value: number | null,
  prop: 'maxWidth' | 'maxHeight'
): void {
  if (value == null) return;
  wrapper.style[prop] = `${value}%`;
}

function applyMaxBounds(wrapper: HTMLElement, opts: WidgetOptionsMeta): void {
  const maxPercent = coercePercent(opts.max);
  if (maxPercent != null) {
    wrapper.classList.add('max');
    applyPercentStyle(wrapper, maxPercent, 'maxWidth');
    applyPercentStyle(wrapper, maxPercent, 'maxHeight');
  }

  const maxWidthPercent = coercePercent(opts.maxWidth);
  if (maxWidthPercent != null) {
    wrapper.classList.add('max-width');
    applyPercentStyle(wrapper, maxWidthPercent, 'maxWidth');
  }

  const maxHeightPercent = coercePercent(opts.maxHeight);
  if (maxHeightPercent != null) {
    wrapper.classList.add('max-height');
    applyPercentStyle(wrapper, maxHeightPercent, 'maxHeight');
  }
}

function resolveWidgetPercents(opts: WidgetOptionsMeta): WidgetDomOptionResult {
  let wPercent: number | null = null;
  let hPercent: number | null = null;

  if (opts.halfWidth) {
    wPercent = 50;
  }
  if (opts.thirdWidth) {
    wPercent = 33.333;
  }
  if (typeof opts.width === 'number' && Number.isFinite(opts.width)) {
    wPercent = opts.width;
  }
  if (typeof opts.height === 'number' && Number.isFinite(opts.height)) {
    hPercent = opts.height;
  }

  return { wPercent, hPercent };
}

function applyWidthClasses(wrapper: HTMLElement, opts: WidgetOptionsMeta): void {
  if (opts.halfWidth) {
    wrapper.classList.add('half-width');
  }
  if (opts.thirdWidth) {
    wrapper.classList.add('third-width');
  }
}

function applyPercentDatasets(wrapper: HTMLElement, result: WidgetDomOptionResult): void {
  if (result.wPercent != null) {
    wrapper.dataset.wPercent = String(result.wPercent);
    if (result.wPercent >= 100) {
      wrapper.dataset.widgetSizeSlot = 'full';
    }
  }
  if (result.hPercent != null) {
    wrapper.dataset.hPercent = String(result.hPercent);
  }
}

function applyOverflow(wrapper: HTMLElement, opts: WidgetOptionsMeta): void {
  const contentEl = wrapper.querySelector<HTMLElement>('.canvas-item-content');
  if (isFullAreaWidget(wrapper)) {
    wrapper.classList.remove('overflow');
    contentEl?.classList.remove('overflow');
    wrapper.dataset.widgetHeightMode = 'auto';
    return;
  }

  if (opts.overflow !== false) {
    wrapper.classList.add('overflow');
    contentEl?.classList.add('overflow');
    return;
  }

  wrapper.classList.remove('overflow');
  contentEl?.classList.remove('overflow');
}

export function applyWidgetDomOptions(
  wrapper: HTMLElement,
  opts: WidgetOptionsMeta = {}
): WidgetDomOptionResult {
  applyMaxBounds(wrapper, opts);
  applyWidthClasses(wrapper, opts);
  const result = resolveWidgetPercents(opts);
  applyPercentDatasets(wrapper, result);
  applyOverflow(wrapper, opts);
  return result;
}
