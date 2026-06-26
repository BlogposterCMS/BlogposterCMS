import { init as initCanvasGrid } from './canvasGrid.js';
import type { RendererGrid } from './runtimeGridMetrics.js';
import { clearContentKeepHeader } from './runtimePageShell.js';
import {
  loadRuntimeLayoutForViewport,
  type RuntimeEmitter as RuntimeDataEmitter
} from './runtimePageData.js';
import { renderAttachedRuntimeContent } from './runtimeAttachedContent.js';
import type { RuntimeWidgetDefinition } from './runtimeWidgetRenderer.js';
import type { RuntimeEmitter as RuntimeWidgetEmitter } from './runtimeWidgetInstances.js';
import {
  mountAdminGridWidgets,
  type RuntimeAdminGridLayoutItem
} from './runtimeAdminGridMounting.js';
import {
  ADMIN_COLUMN_COUNT,
  bindAdminDropTarget,
  bindAdminLayoutPersistence,
  bindResponsiveAdminColumns,
  exposeAdminGridGlobals
} from './runtimeAdminGridInteractions.js';

type LooseRecord = Record<string, any>;
type LayoutItem = RuntimeAdminGridLayoutItem;

export type RuntimeAdminGridOptions = {
  page: LooseRecord;
  contentEl: HTMLElement;
  globalLayout?: LayoutItem[];
  allWidgets: RuntimeWidgetDefinition[];
  lane: string;
  emit: RuntimeDataEmitter;
  widgetEmit: RuntimeWidgetEmitter;
  debug?: boolean;
};

export type RuntimeAdminGridResult = {
  gridEl: HTMLElement;
  grid: RendererGrid;
  layout: LayoutItem[];
};

function createAdminGrid(contentEl: HTMLElement): {
  gridEl: HTMLElement;
  grid: RendererGrid;
} {
  const gridEl = document.createElement('div');
  gridEl.id = 'adminGrid';
  gridEl.className = 'canvas-grid';
  contentEl.appendChild(gridEl);

  const grid = initCanvasGrid({
    cellHeight: 1,
    columnWidth: 1,
    columns: ADMIN_COLUMN_COUNT,
    percentageMode: true,
    pushOnOverlap: true,
    useBoundingBox: true,
    bboxHandles: false,
    enableZoom: false,
    renderPercentLayoutAsPixels: true
  }, gridEl) as RendererGrid;
  grid.options = grid.options || {};

  return { gridEl, grid };
}

export async function renderAdminRuntimeGrid({
  page,
  contentEl,
  globalLayout = [],
  allWidgets,
  lane,
  emit,
  widgetEmit,
  debug = false
}: RuntimeAdminGridOptions): Promise<RuntimeAdminGridResult> {
  let layout = await loadRuntimeLayoutForViewport(emit, page.id, lane);
  if (debug) console.debug('[Renderer] admin layout', layout);
  const combinedAdmin = [...globalLayout, ...layout];

  clearContentKeepHeader(contentEl);
  const { gridEl, grid } = createAdminGrid(contentEl);
  bindResponsiveAdminColumns(gridEl, grid);
  exposeAdminGridGlobals(grid, page.id, lane, layout);
  bindAdminDropTarget(gridEl, grid);

  const instanceMetaMap = new Map<string, LayoutItem>();
  await mountAdminGridWidgets({
    gridEl,
    grid,
    layout: combinedAdmin,
    allWidgets,
    lane,
    widgetEmit,
    instanceMetaMap,
    debug
  });

  await renderAttachedRuntimeContent({
    page,
    lane,
    allWidgets,
    container: contentEl,
    emit,
    widgetEmit
  });

  bindAdminLayoutPersistence({
    grid,
    gridEl,
    instanceMetaMap,
    layout,
    pageId: page.id,
    lane,
    emit
  });

  return { gridEl, grid, layout };
}
