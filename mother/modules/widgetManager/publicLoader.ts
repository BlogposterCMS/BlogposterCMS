import { PUBLIC_CANVAS_STYLE_ID, PUBLIC_CANVAS_CSS, publicCanvasStyle, publicItemStyle, publicPlacement } from '/ui/shared/layout/publicCanvasPresentation.js';


// The loader is fetched as browser ESM rather than bundled server code.
import { emitRuntimePublic, RUNTIME_PUBLIC_REQUEST_EVENT } from '/ui/shared/api-client/runtimeFacade.js';

import { executeJs } from '/ui/runtime/main/script-utils.js';
import { sanitizeHtml } from '/ui/shared/sanitize/sanitizer.js';
import type { PublicWidgetJob } from '/ui/runtime/main/publicWidgetScheduling.js';

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
  document?: { layoutTree?: unknown };
  styles?: { background?: string };
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
  hasPageHtmlContent?: boolean;
  pageContentHost?: HTMLElement | null;
  expectsPageContent?: boolean;
  contentDesignId?: string;
  requiresContentSlot?: boolean;
  layoutCompositionFailed?: boolean;
  initialHtml?: HTMLElement | null;
};

type WidgetRegister = (loaderName: 'widgets', loader: typeof loadWidgets) => void;
type WidgetDescriptor = {
  layout?: unknown;
  layoutRef?: unknown;
};




const PUBLIC_WIDGETS_READY_EVENT = 'bp:public-widgets-ready';

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function ensurePublicCanvasStyles(): void {
  if (document.getElementById(PUBLIC_CANVAS_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PUBLIC_CANVAS_STYLE_ID;
  style.textContent = PUBLIC_CANVAS_CSS;
  document.head.appendChild(style);
}
function preparePublicCanvas(gridEl: HTMLElement, layout: PublicWidgetLayout): void {
  ensurePublicCanvasStyles();
  gridEl.classList.add('bp-public-canvas');
  Object.entries(publicCanvasStyle(layout)).forEach(([key, value]) => gridEl.style.setProperty(key, value));
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
  const { x, y, w, h } = publicPlacement(item);
  itemEl.dataset.xPercent = String(x);
  itemEl.dataset.yPercent = String(y);
  itemEl.dataset.wPercent = String(w);
  itemEl.dataset.hPercent = String(h);
  Object.entries(publicItemStyle(item)).forEach(([key, value]) => itemEl.style.setProperty(key, value));
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
    ...(isRecord(value.document) ? { document: { layoutTree: value.document.layoutTree } } : {}),
    ...(isRecord(value.styles) ? { styles: value.styles as { background?: string } } : {}),
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

async function emitPublicRuntime<T>(
  ctx: WidgetLoaderContext,
  resource: string,
  action: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  if (typeof ctx.meltdownEmit !== 'function') {
    throw new Error('[WidgetPublicLoader:PUBLIC_RUNTIME_EMIT_MISSING] meltdownEmit is required.');
  }
  return emitRuntimePublic<T>(ctx.meltdownEmit, ctx.publicToken, resource, action, params);
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
    && (/^\/ui\/widgets\/plainspace\/public\/basicwidgets\/[A-Za-z0-9_-]+\.js$/.test(value)
      || /^\/widgets\/[A-Za-z0-9_-]+\/widget\.js$/.test(value));
}

async function renderWidgetModule(
  container: HTMLElement,
  item: PublicWidgetLayoutItem,
  def: PublicWidgetDefinition,
  ctx: WidgetLoaderContext
): Promise<boolean> {
  if (!isSafeWidgetModulePath(def.content)) return false;
  try {
    const [{ mountWidgetModule }, { loadWidgetModule }] = await Promise.all([
      import('/ui/widgets/rendering/widgetModuleMount.js'),
      import('/ui/widgets/rendering/widgetModuleLoader.js')
    ]);
    await mountWidgetModule(container, { id: String(item.widgetId), codeUrl: def.content }, loadWidgetModule, () => ({
      id: item.instanceId,
      widgetId: item.widgetId,
      metadata: def.metadata || {},
      instanceMetadata: isRecord(item.metadata) ? item.metadata : {}
    }));
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

  if (layout.document?.layoutTree) {
    // Reuse the Designer/preview structural renderer. This is the same document
    // and public facade, not a second public composition implementation.
    const [{ renderRuntimeDesignDocument, getRuntimeDesignDocument, getRuntimeDesignContentMount },
      { normalizeRuntimeDesignWidget }, { hydratePublicWidgets }, registry] = await Promise.all([
      import(/* webpackIgnore: true */ '/ui/runtime/main/runtimeDesignDocument.js'),
      import(/* webpackIgnore: true */ '/ui/runtime/main/runtimeDesignLayouts.js'),
      import(/* webpackIgnore: true */ '/ui/runtime/main/publicWidgetScheduling.js'),
      emitPublicRuntime<PublicWidgetDefinition[]>(ctx, 'widgets', 'list')
    ]);
    root.querySelector('#bp-grid[data-bp-initial-layout="true"]')?.remove();
    const shell = document.createElement('div');
    shell.id = 'bp-grid';
    if (layout.styles?.background) shell.style.background = layout.styles.background;
    root.append(shell);
    const byId = new Map(registry.map(def => [String(def.widgetId), def]));
    const placements = (layout.items || []).map(item => {
      const fallback = parseWidgetCode(byId.get(String(item.widgetId))?.content);
      return normalizeRuntimeDesignWidget({ ...fallback, ...item });
    }).filter(Boolean);
    const definitions = registry.map(def => ({ ...def, id: String(def.widgetId || ''),
      codeUrl: isSafeWidgetModulePath(def.content) ? def.content : undefined }));
    const publicEmit = async <T = unknown>(event: string, payload: Record<string, unknown> = {}): Promise<T> => {
      if (event !== RUNTIME_PUBLIC_REQUEST_EVENT) throw new Error('WIDGET_PUBLIC_EVENT_DENIED: Only the public facade is available.');
      return ctx.meltdownEmit!<T>(event, { ...payload, jwt: ctx.publicToken });
    };
    const publicHydrationJobs: PublicWidgetJob[] = [];
    try {
      await renderRuntimeDesignDocument(shell, getRuntimeDesignDocument({ ...layout.document, placements }), definitions, 'public', {
      emit: publicEmit, widgetEmit: publicEmit,
      publicHydrationJobs,
      contentDesignId: ctx.contentDesignId,
      initialPageHtml: ctx.expectsPageContent && ctx.initialHtml?.id === 'bp-initial-html' ? ctx.initialHtml : null,
      designPath: layout.layoutRef ? [layout.layoutRef.replace(/^layout:/, '').replace(/@.*$/, '')] : []
      });
    } catch (error) {
      console.warn('RUNTIME_PAGE_COMPOSITION_FAILED: Keeping page content available.', error);
      ctx.layoutCompositionFailed = true;
    }
    const host = getRuntimeDesignContentMount(shell);
    ctx.pageContentHost = host.dataset.dynamicHost === 'true' ? host : null;
    if (ctx.requiresContentSlot && !ctx.pageContentHost) {
      console.warn('RUNTIME_PAGE_CONTENT_SLOT_MISSING: Keeping the page body outside the incomplete design.');
      ctx.layoutCompositionFailed = true;
    }
    await hydratePublicWidgets(publicHydrationJobs);
    markPublicWidgetsReady(layout, placements.length);
    return;
  }

  // Raw HTML is the complete fallback presentation when no widget placements
  // exist. Appending the default 100vh canvas here would add a blank page after
  // otherwise complete imported or hand-authored content.
  const hasHtmlPage = ctx.hasPageHtmlContent === true || Boolean(root.querySelector('.bp-page-html'));
  if ((layout.items || []).length === 0 && (hasHtmlPage || ctx.expectsPageContent)) {
    markPublicWidgetsReady(layout, 0);
    return;
  }

  // HTML-only pages return above without downloading the interactive grid's
  // dependency graph. Import concrete shared helpers instead of the runtime
  // barrel, whose re-exports also pull admin surfaces into public page startup.
  const runtimeReady = Promise.all([
    import(/* webpackIgnore: true */ '/ui/shared/grid/canvasGrid.js'),
    import(/* webpackIgnore: true */ '/ui/widgets/options/widgetOptions.js'),
    import(/* webpackIgnore: true */ '/ui/runtime/main/publicWidgetScheduling.js')
  ]).catch(error => {
    throw new Error('WIDGET_PUBLIC_RUNTIME_IMPORT_FAILED: Unable to load canvas dependencies.', { cause: error });
  });
  const registryReady = typeof ctx.meltdownEmit === 'function'
    ? emitPublicRuntime<PublicWidgetDefinition[]>(ctx, 'widgets', 'list').catch(() => [])
    : [];
  const [[{ init: initCanvasGrid }, { applyWidgetOptions }, { hydratePublicWidgets }], registry] = await Promise.all([
    runtimeReady,
    registryReady
  ]);

  // Adopt only the server shell for this document. Widget data and module
  // execution remain on the existing client facade/rendering path.
  const initialGrid = root.querySelector<HTMLElement>('#bp-grid[data-bp-initial-layout="true"]');
  const gridEl = initialGrid || document.createElement('div');
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
  const publicHydrationJobs: PublicWidgetJob[] = [];
  for (const [itemIndex, item] of (layout.items || []).entries()) {
    const def = registry.find(widget => widget.widgetId === item.widgetId);
    if (!def) continue;
    const itemEl = initialGrid?.querySelector<HTMLElement>(`[data-bp-initial-item="${itemIndex}"]`)
      || document.createElement('div');
    delete itemEl.dataset.bpInitialItem;
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
    itemEl.setAttribute('aria-busy', 'true');
    itemEl.dataset.widgetHydrationState = 'shell';
    const placeholder = itemEl.querySelector<HTMLElement>(':scope > .widget-placeholder') || document.createElement('div');
    placeholder.className = 'widget-placeholder';
    placeholder.setAttribute('role', 'status');
    placeholder.textContent = 'Loading';
    itemEl.appendChild(placeholder);

    publicHydrationJobs.push({
      element: itemEl,
      eager: Boolean(item.js || parseWidgetCode(def.content).js),
      render: async () => {
        itemEl.dataset.widgetHydrationState = 'hydrating';

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
        placeholder.remove();
        itemEl.setAttribute('aria-busy', 'false');
        itemEl.dataset.widgetHydrationState = 'ready';
        renderedCount += 1;
      }
    });
  }
  // Missing widget definitions must not leave an unhydrated server placeholder.
  gridEl.querySelectorAll('[data-bp-initial-item]').forEach(element => element.remove());
  delete gridEl.dataset.bpInitialLayout;
  preparePublicCanvas(gridEl, layout);
  await hydratePublicWidgets(publicHydrationJobs);
  markPublicWidgetsReady(layout, renderedCount);
}

export function registerLoaders(register: WidgetRegister): void {
  register('widgets', loadWidgets);
}

export { loadWidgets };
