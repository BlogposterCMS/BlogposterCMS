import { init as initCanvasGrid } from './canvasGrid.js';
import {
  computeStaticGridMetrics,
  deriveGridSize,
  type RendererGrid
} from './runtimeGridMetrics.js';
import type { RuntimeWidgetDefinition } from './runtimeWidgetRenderer.js';
import {
  mountRuntimeGridWidgets,
  type RuntimeGridLayoutItem
} from './runtimeGridWidgetMounting.js';
import type { RuntimeEmitter as RuntimeWidgetEmitter } from './runtimeWidgetInstances.js';

type LayoutItem = RuntimeGridLayoutItem;

const noopWidgetEmit: RuntimeWidgetEmitter = async () => undefined;

export type RuntimeStaticGridOptions = {
  gridEl?: HTMLElement | null;
  grid?: RendererGrid | null;
  append?: boolean;
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
  const widgetEmit = opts.widgetEmit || noopWidgetEmit;
  if (!append || !gridEl || !grid) {
    gridEl = document.createElement('div');
    gridEl.className = 'canvas-grid';
    target.appendChild(gridEl);
    grid = initCanvasGrid(
      {
        staticGrid: true,
        float: true,
        cellHeight: 1,
        columnWidth: 1,
        columns: Infinity,
        enableZoom: false,
      },
      gridEl
    ) as RendererGrid;
  }

  const metrics = computeStaticGridMetrics(gridEl, layout);
  grid.options = grid.options || {};
  grid.options.columnWidth = 1;
  grid.options.cellHeight = 1;
  grid.options.columns = Infinity;
  grid.options.rows = Infinity;
  gridEl.style.height = `${metrics.height}px`;

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
      enableZoom: false
    },
    gridEl
  ) as RendererGrid;

  const { cols, rows } = deriveGridSize(gridEl, grid, layout);
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
}
