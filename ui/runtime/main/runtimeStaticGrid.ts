import { init as initCanvasGrid } from './canvasGrid.js';
import {
  computeStaticGridMetrics,
  deriveGridSize,
  type RendererGrid
} from './runtimeGridMetrics.js';
import type { RuntimeWidgetDefinition } from './runtimeWidgetRenderer.js';
import {
  mountRuntimeGridStructuralItems,
  mountRuntimeGridWidgets,
  reflowRuntimeGridWidgets,
  type RuntimeGridLayoutItem
} from './runtimeGridWidgetMounting.js';
import type { RuntimeEmitter as RuntimeWidgetEmitter } from './runtimeWidgetInstances.js';

type LayoutItem = RuntimeGridLayoutItem;

type ResponsiveRuntimeGridElement = HTMLElement & {
  __runtimeResponsiveObserver?: ResizeObserver;
  __runtimeResponsiveFrame?: number;
  __runtimeResponsiveLayout?: LayoutItem[];
  __runtimeScheduleResponsiveReflow?: () => void;
};

const noopWidgetEmit: RuntimeWidgetEmitter = async () => undefined;

function mergeResponsiveLayout(
  gridEl: ResponsiveRuntimeGridElement,
  layout: LayoutItem[],
  append: boolean
): void {
  const current = append && Array.isArray(gridEl.__runtimeResponsiveLayout)
    ? gridEl.__runtimeResponsiveLayout
    : [];
  const byId = new Map<string, LayoutItem>();
  [...current, ...layout].forEach((item, index) => {
    byId.set(String(item?.id || `runtime-item-${index}`), item);
  });
  gridEl.__runtimeResponsiveLayout = [...byId.values()];
}

function installStaticGridResponsiveReflow(
  gridEl: ResponsiveRuntimeGridElement,
  grid: RendererGrid,
  fallbackLayout: LayoutItem[],
  manageGridHeight = true
): void {
  const requestFrame = typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 0);
  const cancelFrame = typeof window.cancelAnimationFrame === 'function'
    ? window.cancelAnimationFrame.bind(window)
    : window.clearTimeout.bind(window);

  const reflow = (): void => {
    gridEl.__runtimeResponsiveFrame = undefined;
    if (!gridEl.isConnected) {
      gridEl.__runtimeResponsiveObserver?.disconnect();
      return;
    }
    try {
      const layout = gridEl.__runtimeResponsiveLayout || fallbackLayout;
      const metrics = computeStaticGridMetrics(gridEl, layout);
      if (manageGridHeight) gridEl.style.height = `${metrics.height}px`;
      reflowRuntimeGridWidgets({
        gridEl,
        grid,
        scaleX: metrics.scaleX,
        scaleY: metrics.scaleY,
        percentDivisor: 1
      });
    } catch (error) {
      console.warn('RUNTIME_RESPONSIVE_REFLOW_FAILED', error);
    }
  };
  const schedule = (): void => {
    if (gridEl.__runtimeResponsiveFrame !== undefined) {
      cancelFrame(gridEl.__runtimeResponsiveFrame);
    }
    gridEl.__runtimeResponsiveFrame = requestFrame(reflow);
  };
  gridEl.__runtimeScheduleResponsiveReflow = schedule;

  if (!gridEl.__runtimeResponsiveObserver && typeof ResizeObserver !== 'undefined') {
    gridEl.__runtimeResponsiveObserver = new ResizeObserver(schedule);
    gridEl.__runtimeResponsiveObserver.observe(gridEl);
  }
  // The iframe or document surface can finish sizing after its first paint.
  // Always project once more on the next frame, even without a resize event.
  schedule();
}

export type RuntimeStaticGridOptions = {
  gridEl?: HTMLElement | null;
  grid?: RendererGrid | null;
  append?: boolean;
  useTargetAsGrid?: boolean;
  structuralItems?: Array<{
    element: HTMLElement;
    item: RuntimeGridLayoutItem;
  }>;
  widgetEmit?: RuntimeWidgetEmitter;
};

export async function renderStaticRuntimeGrid(
  target: HTMLElement,
  layout: LayoutItem[],
  allWidgets: RuntimeWidgetDefinition[],
  lane: string,
  opts: RuntimeStaticGridOptions = {}
): Promise<{ gridEl: HTMLElement | null; grid: RendererGrid | null }> {
  if (!target) return { gridEl: null, grid: null };

  let { gridEl, grid, append = false } = opts;
  const structuralItems = Array.isArray(opts.structuralItems) ? opts.structuralItems : [];
  const widgetEmit = opts.widgetEmit || noopWidgetEmit;
  if (!append || !gridEl || !grid) {
    gridEl = opts.useTargetAsGrid ? target : document.createElement('div');
    gridEl.classList.add('canvas-grid');
    if (!opts.useTargetAsGrid) target.appendChild(gridEl);
    grid = initCanvasGrid(
      {
        staticGrid: true,
        float: true,
        cellHeight: 1,
        columnWidth: 1,
        columns: Infinity,
        enableZoom: false,
        preservePixelWidgetSize: true,
      },
      gridEl
    ) as RendererGrid;
  }

  const projectionLayout = [
    ...structuralItems.map(entry => entry.item),
    ...layout
  ];
  mergeResponsiveLayout(gridEl as ResponsiveRuntimeGridElement, projectionLayout, append);
  const metrics = computeStaticGridMetrics(gridEl, projectionLayout);
  grid.options = grid.options || {};
  grid.options.columnWidth = 1;
  grid.options.cellHeight = 1;
  grid.options.columns = Infinity;
  grid.options.rows = Infinity;
  grid.options.preservePixelWidgetSize = true;
  if (!opts.useTargetAsGrid) gridEl.style.height = `${metrics.height}px`;

  mountRuntimeGridStructuralItems({
    grid,
    items: structuralItems,
    scaleX: metrics.scaleX,
    scaleY: metrics.scaleY,
    percentDivisor: 1
  });

  await mountRuntimeGridWidgets({
    gridEl,
    grid,
    layout,
    allWidgets,
    lane,
    widgetEmit,
    scaleX: metrics.scaleX,
    scaleY: metrics.scaleY,
    percentDivisor: 1,
    includeLayoutMetadata: true
  });
  installStaticGridResponsiveReflow(
    gridEl as ResponsiveRuntimeGridElement,
    grid as RendererGrid,
    projectionLayout,
    !opts.useTargetAsGrid
  );
  return { gridEl, grid };
}

export async function renderPublicRuntimeGrid(
  target: HTMLElement,
  layout: LayoutItem[],
  allWidgets: RuntimeWidgetDefinition[],
  lane: string,
  widgetEmit: RuntimeWidgetEmitter,
  debug = false
): Promise<void> {
  const gridEl = document.createElement('div');
  gridEl.id = 'publicGrid';
  gridEl.className = 'canvas-grid';
  target.appendChild(gridEl);

  const grid = initCanvasGrid(
    {
      staticGrid: true,
      float: true,
      cellHeight: 1,
      columnWidth: 1,
      enableZoom: false,
      preservePixelWidgetSize: true
    },
    gridEl
  ) as RendererGrid;

  const { cols, rows } = deriveGridSize(gridEl, grid, layout);
  mergeResponsiveLayout(gridEl as ResponsiveRuntimeGridElement, layout, false);
  await mountRuntimeGridWidgets({
    gridEl,
    grid,
    layout,
    allWidgets,
    lane,
    widgetEmit,
    scaleX: cols,
    scaleY: rows,
    debug
  });
  installStaticGridResponsiveReflow(
    gridEl as ResponsiveRuntimeGridElement,
    grid as RendererGrid,
    layout
  );
}
