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
  createAdminDashboardController,
  exposeAdminGridGlobals
} from './runtimeAdminGridInteractions.js';
import type { RuntimeAdminDashboardController } from './runtimeAdminGridInteractions.js';

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
  grid: RuntimeAdminDashboardController;
  layout: LayoutItem[];
};

function createAdminGrid(contentEl: HTMLElement): {
  gridEl: HTMLElement;
  grid: RuntimeAdminDashboardController;
} {
  const gridEl = document.createElement('div');
  gridEl.id = 'adminGrid';
  gridEl.className = 'canvas-grid dashboard-grid';
  gridEl.style.setProperty('--dashboard-columns', String(ADMIN_COLUMN_COUNT));
  contentEl.appendChild(gridEl);

  const grid = createAdminDashboardController(gridEl);
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
