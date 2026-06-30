import { init as initCanvasGrid } from '/ui/runtime/main/canvasGrid.js';
import { applyWidgetOptions } from '/ui/runtime/main/widgetOptions.js';
import { executeJs } from '/ui/runtime/main/script-utils.js';
import { sanitizeHtml } from '/ui/shared/sanitize/sanitizer.js';

type PublicWidgetLayoutItem = {
  widgetId?: string;
  instanceId?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  xPercent?: number;
  yPercent?: number;
  wPercent?: number;
  hPercent?: number;
  html?: string;
  css?: string;
  js?: string;
  zIndex?: number;
  rotationDeg?: number;
  opacity?: number;
  metadata?: Record<string, unknown>;
};

type PublicWidgetLayout = {
  grid?: {
    columns?: number;
    cellHeight?: number;
    rows?: number;
  };
  items?: PublicWidgetLayoutItem[];
  layoutRef?: string;
};

type PublicWidgetDefinition = {
  widgetId?: string;
  content?: string | WidgetCode | null;
  metadata?: Record<string, unknown>;
};

type WidgetCode = {
  html?: string;
  css?: string;
  js?: string;
};

type PublicWidgetModule = {
  render?: (
    el: HTMLElement,
    ctx?: Record<string, unknown>
  ) => void | Promise<void>;
};

type WidgetLoaderContext = {
  meltdownEmit?: <T = unknown>(eventName: string, payload?: Record<string, unknown>) => Promise<T>;
  publicToken?: string | null;
  activeLayout?: unknown;
  activeLayoutRef?: unknown;
};

type WidgetRegister = (loaderName: 'widgets', loader: typeof loadWidgets) => void;
type WidgetDescriptor = {
  layout?: unknown;
  layoutRef?: unknown;
};

type RuntimeFacadeResponse<T> = {
  resource?: string;
  action?: string;
  data?: T;
};

const PUBLIC_CANVAS_STYLE_ID = 'bp-public-canvas-runtime-style';
const PUBLIC_CANVAS_MIN_HEIGHT_PERCENT = 100;
const PUBLIC_CANVAS_MAX_HEIGHT_PERCENT = 400;
const PUBLIC_WIDGETS_READY_EVENT = 'bp:public-widgets-ready';

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toBoundedPercent(value: unknown, fallback: number, max = 100): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(0, num));
}

function publicCanvasHeightPercent(layout: PublicWidgetLayout): number {
  const maxPercent = (layout.items || []).reduce((max, item) => {
    const y = toBoundedPercent(item.yPercent, 0, PUBLIC_CANVAS_MAX_HEIGHT_PERCENT);
    const h = toBoundedPercent(item.hPercent, 0, PUBLIC_CANVAS_MAX_HEIGHT_PERCENT);
    return Math.max(max, y + h);
  }, PUBLIC_CANVAS_MIN_HEIGHT_PERCENT);
  return Math.min(
    PUBLIC_CANVAS_MAX_HEIGHT_PERCENT,
    Math.max(PUBLIC_CANVAS_MIN_HEIGHT_PERCENT, Math.ceil(maxPercent))
  );
}

function ensurePublicCanvasStyles(): void {
  if (document.getElementById(PUBLIC_CANVAS_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PUBLIC_CANVAS_STYLE_ID;
  style.textContent = `
.bp-public-canvas {
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  overflow: visible;
  contain: none;
  background: var(--studio-canvas, #fff);
  color: var(--studio-text, #1f2933);
}
.bp-public-canvas,
.bp-public-canvas * {
  box-sizing: border-box;
}
.bp-public-canvas > .canvas-item {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow: visible;
  user-select: auto;
  -webkit-user-select: auto;
  backdrop-filter: none;
  transition: none;
}
.bp-public-canvas > .canvas-item::before,
.bp-public-canvas .resize-handle,
.bp-public-canvas .bounding-box {
  display: none !important;
}
.bp-public-canvas .widget {
  width: 100%;
  height: 100%;
  min-height: 100%;
}
@media (max-width: 760px) {
  .bp-public-canvas {
    display: grid;
    gap: 16px;
    height: auto !important;
    min-height: auto !important;
    padding: 24px !important;
  }
  .bp-public-canvas > .canvas-item {
    position: relative !important;
    left: auto !important;
    top: auto !important;
    width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    transform: none !important;
  }
  .bp-public-canvas .widget {
    height: auto;
    min-height: 0;
  }
}
  `.trim();
  document.head.appendChild(style);
}

function preparePublicCanvas(gridEl: HTMLElement, layout: PublicWidgetLayout): void {
  ensurePublicCanvasStyles();
  const height = `${publicCanvasHeightPercent(layout)}vh`;
  gridEl.classList.add('bp-public-canvas');
  gridEl.style.width = '100%';
  gridEl.style.minHeight = height;
  gridEl.style.height = height;
  gridEl.style.position = 'relative';
  gridEl.style.overflow = 'visible';
  gridEl.style.setProperty('--studio-canvas', '#ffffff');
  gridEl.style.setProperty('--studio-surface-solid', '#ffffff');
  gridEl.style.setProperty('--studio-surface-muted', '#f6f7f8');
  gridEl.style.setProperty('--studio-text', '#1f2933');
  gridEl.style.setProperty('--studio-text-muted', 'rgba(31,41,51,.62)');
  gridEl.style.setProperty('--studio-border', 'rgba(17,24,39,.08)');
  gridEl.style.setProperty('--studio-border-strong', 'rgba(17,24,39,.14)');
  gridEl.style.setProperty('--studio-radius-panel', '18px');
  gridEl.style.setProperty('--studio-radius-control', '999px');
  gridEl.style.setProperty('--studio-shadow-soft', '0 1px 2px rgba(0,0,0,.04), 0 14px 36px rgba(17,24,39,.08)');
}

function markPublicWidgetsReady(layout: PublicWidgetLayout, renderedCount: number): void {
  document.documentElement.dataset.bpPublicWidgetsReady = 'true';
  window.dispatchEvent(new CustomEvent(PUBLIC_WIDGETS_READY_EVENT, {
    detail: {
      layoutRef: layout.layoutRef || '',
      renderedCount
    }
  }));
}

function applyPublicPercentPosition(itemEl: HTMLElement, item: PublicWidgetLayoutItem): void {
  const x = toBoundedPercent(item.xPercent, 0);
  const y = toBoundedPercent(item.yPercent, 0, PUBLIC_CANVAS_MAX_HEIGHT_PERCENT);
  const w = toBoundedPercent(item.wPercent, 100);
  const h = toBoundedPercent(item.hPercent, 0, PUBLIC_CANVAS_MAX_HEIGHT_PERCENT);
  itemEl.dataset.xPercent = String(x);
  itemEl.dataset.yPercent = String(y);
  itemEl.dataset.wPercent = String(w);
  itemEl.dataset.hPercent = String(h);
  itemEl.style.position = 'absolute';
  itemEl.style.left = `${x}%`;
  itemEl.style.top = `${y}%`;
  itemEl.style.width = `${Math.max(1, w)}%`;
  itemEl.style.height = h > 0 ? `${h}%` : 'auto';
  if (Number.isFinite(Number(item.zIndex))) itemEl.style.zIndex = String(Number(item.zIndex));
  if (Number.isFinite(Number(item.opacity))) itemEl.style.opacity = String(Number(item.opacity));
  const rotation = Number(item.rotationDeg);
  itemEl.style.transform = Number.isFinite(rotation) && rotation !== 0 ? `rotate(${rotation}deg)` : '';
}

function normalizePublicWidgetLayout(value: unknown): PublicWidgetLayout | null {
  if (!isRecord(value)) return null;
  const items = Array.isArray(value.items) ? value.items : [];
  const grid = isRecord(value.grid) ? value.grid : {};
  return {
    grid: {
      columns: toNumber(grid.columns, 12),
      cellHeight: toNumber(grid.cellHeight, 8),
      rows: toNumber(grid.rows, 0)
    },
    items: items.filter(isRecord) as PublicWidgetLayoutItem[],
    layoutRef: typeof value.layoutRef === 'string' ? value.layoutRef : undefined
  };
}

function fallbackLayout(layoutRef?: unknown): PublicWidgetLayout {
  return {
    grid: { columns: 12, cellHeight: 8 },
    items: [],
    layoutRef: typeof layoutRef === 'string' ? layoutRef : undefined
  };
}

function unwrapRuntimeFacadeData<T>(value: unknown): T {
  if (
    isRecord(value) &&
    'resource' in value &&
    'action' in value &&
    'data' in value
  ) {
    return (value as RuntimeFacadeResponse<T>).data as T;
  }
  return value as T;
}

async function emitPublicRuntime<T>(
  ctx: WidgetLoaderContext,
  resource: string,
  action: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  if (typeof ctx.meltdownEmit !== 'function') {
    throw new Error('[WidgetPublicLoader:PUBLIC_RUNTIME_EMIT_MISSING] meltdownEmit is required.');
  }
  const result = await ctx.meltdownEmit('cmsPublicRuntimeRequest', {
    jwt: ctx.publicToken,
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource,
    action,
    params
  });
  return unwrapRuntimeFacadeData<T>(result);
}

function resolveWidgetLayout(
  descriptor: WidgetDescriptor,
  ctx: WidgetLoaderContext
): PublicWidgetLayout {
  const descriptorLayout = normalizePublicWidgetLayout(descriptor.layout);
  if (descriptorLayout) return descriptorLayout;

  if (descriptor.layout !== undefined) {
    console.warn('[WidgetPublicLoader:INVALID_LAYOUT_DESCRIPTOR] Ignoring invalid widget layout descriptor.');
  }

  const ctxLayout = normalizePublicWidgetLayout(ctx.activeLayout);
  if (ctxLayout) return ctxLayout;

  return fallbackLayout(descriptor.layoutRef || ctx.activeLayoutRef);
}

function parseWidgetCode(content: PublicWidgetDefinition['content']): WidgetCode {
  if (!content) return {};
  if (typeof content !== 'string') return content;
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function isSafeWidgetModulePath(value: unknown): value is string {
  return typeof value === 'string'
    && /^\/ui\/widgets\/plainspace\/public\/basicwidgets\/[A-Za-z0-9_-]+\.js$/.test(value);
}

async function renderWidgetModule(
  container: HTMLElement,
  item: PublicWidgetLayoutItem,
  def: PublicWidgetDefinition,
  ctx: WidgetLoaderContext
): Promise<boolean> {
  if (!isSafeWidgetModulePath(def.content)) return false;
  try {
    const mod = await import(/* webpackIgnore: true */ def.content) as PublicWidgetModule;
    if (typeof mod.render !== 'function') return false;
    await mod.render(container, {
      id: item.instanceId,
      widgetId: item.widgetId,
      publicToken: ctx.publicToken,
      meltdownEmit: ctx.meltdownEmit,
      metadata: def.metadata || {},
      instanceMetadata: isRecord(item.metadata) ? item.metadata : {}
    });
    return true;
  } catch (error) {
    console.error('[WidgetPublicLoader:MODULE_RENDER_FAILED]', error);
    return false;
  }
}

function createInstanceId(item: PublicWidgetLayoutItem): string {
  const generated = globalThis.crypto?.randomUUID?.() || String(Math.random());
  return item.instanceId || generated;
}

async function loadWidgets(
  descriptor: WidgetDescriptor = {},
  ctx: WidgetLoaderContext = {}
): Promise<void> {
  const layout = resolveWidgetLayout(descriptor, ctx);
  const root = document.getElementById('app') || document.body;

  const registry = typeof ctx.meltdownEmit === 'function'
    ? await emitPublicRuntime<PublicWidgetDefinition[]>(ctx, 'widgets', 'list').catch(() => [])
    : [];

  const gridEl = document.createElement('div');
  gridEl.id = 'bp-grid';
  preparePublicCanvas(gridEl, layout);
  root.appendChild(gridEl);

  const cols = toNumber(layout.grid?.columns, 12);
  const cellHeight = toNumber(layout.grid?.cellHeight, 8);
  const grid = initCanvasGrid({
    columns: cols,
    cellHeight,
    percentageMode: true,
    staticGrid: true,
    enableZoom: false
  }, gridEl);
  let rows = toNumber(layout.grid?.rows, 0);
  if (!rows) {
    const maxPercent = (layout.items || []).reduce(
      (max, item) => Math.max(max, (item.yPercent ?? 0) + (item.hPercent ?? 0)),
      100
    );
    rows = Math.max(1, Math.round((maxPercent / 100) * cols));
  }

  let renderedCount = 0;
  for (const item of layout.items || []) {
    const def = registry.find(widget => widget.widgetId === item.widgetId);
    if (!def) continue;
    const itemEl = document.createElement('div');
    itemEl.className = 'canvas-item';
    itemEl.dataset.instanceId = createInstanceId(item);

    const x = item.xPercent !== undefined ? Math.round((item.xPercent / 100) * cols) : item.x || 0;
    const y = item.yPercent !== undefined ? Math.round((item.yPercent / 100) * rows) : item.y || 0;
    const w = item.wPercent !== undefined ? Math.max(1, Math.round((item.wPercent / 100) * cols)) : item.w || 4;
    const h = item.hPercent !== undefined ? Math.max(1, Math.round((item.hPercent / 100) * rows)) : item.h || 8;
    itemEl.dataset.x = String(x);
    itemEl.dataset.y = String(y);
    itemEl.setAttribute('gs-w', String(w));
    itemEl.setAttribute('gs-h', String(h));
    gridEl.appendChild(itemEl);
    grid.makeWidget(itemEl);
    applyPublicPercentPosition(itemEl, item);

    const container = document.createElement('div');
    container.className = 'widget';
    itemEl.appendChild(container);

    const renderedByModule = await renderWidgetModule(container, item, def, ctx);
    if (!renderedByModule) {
      const code = {
        ...parseWidgetCode(def.content),
        ...(item.html ? { html: item.html } : {}),
        ...(item.css ? { css: item.css } : {}),
        ...(item.js ? { js: item.js } : {})
      };
      if (code?.css) {
        const style = document.createElement('style');
        style.textContent = code.css;
        itemEl.appendChild(style);
      }
      if (code?.html) container.innerHTML = sanitizeHtml(code.html);
      if (code?.js) {
        try {
          executeJs(code.js, itemEl, itemEl, 'Widget');
        } catch (error) {
          console.error(error);
        }
      }
    }

    applyWidgetOptions(itemEl, def.metadata || {});
    applyPublicPercentPosition(itemEl, item);
    renderedCount += 1;
  }
  preparePublicCanvas(gridEl, layout);
  markPublicWidgetsReady(layout, renderedCount);
}

export function registerLoaders(register: WidgetRegister): void {
  register('widgets', loadWidgets);
}

export { loadWidgets };
