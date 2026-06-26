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

type WindowWithPublicLayout = Window & {
  __BP_ACTIVE_LAYOUT__?: PublicWidgetLayout;
};

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

  const legacyLayout = normalizePublicWidgetLayout((window as WindowWithPublicLayout).__BP_ACTIVE_LAYOUT__);
  if (legacyLayout) return legacyLayout;

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
    ? await ctx.meltdownEmit<PublicWidgetDefinition[]>('getWidgets', {
        jwt: ctx.publicToken,
        moduleName: 'widgetManager',
        moduleType: 'core',
        widgetType: 'public'
      }).catch(() => [])
    : [];

  const gridEl = document.createElement('div');
  gridEl.id = 'bp-grid';
  root.appendChild(gridEl);

  const cols = toNumber(layout.grid?.columns, 12);
  const cellHeight = toNumber(layout.grid?.cellHeight, 8);
  const grid = initCanvasGrid({ columns: cols, cellHeight }, gridEl);
  let rows = toNumber(layout.grid?.rows, 0);
  if (!rows) {
    const maxPercent = (layout.items || []).reduce(
      (max, item) => Math.max(max, (item.yPercent ?? 0) + (item.hPercent ?? 0)),
      100
    );
    rows = Math.max(1, Math.round((maxPercent / 100) * cols));
  }

  for (const item of layout.items || []) {
    const def = registry.find(widget => widget.widgetId === item.widgetId);
    if (!def) continue;
    const code = parseWidgetCode(def.content);
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

    const container = document.createElement('div');
    container.className = 'widget';
    itemEl.appendChild(container);

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

    applyWidgetOptions(
      itemEl,
      def.metadata || {},
      grid as unknown as Parameters<typeof applyWidgetOptions>[2]
    );
  }
}

export function registerLoaders(register: WidgetRegister): void {
  register('widgets', loadWidgets);
}

export { loadWidgets };
