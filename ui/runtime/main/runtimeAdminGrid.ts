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
  const fixed = page.meta?.dashboardLayout === 'fixed';
  // Fixed CMS tools still use the normal widget loader and module contracts.
  // Their composition comes from the page owner, not personal dashboard slots.
  const layout: LayoutItem[] = fixed
    ? (page.meta.widgets || []).map((widgetId: string, index: number) => ({
        id: `workspace-${page.id}-${widgetId}`,
        widgetId,
        slot: page.meta.widgetSlots?.[widgetId] || 'page',
        order: index * 10
      }))
    : await loadRuntimeLayoutForViewport(emit, page.id, lane);
  if (debug) console.debug('[Renderer] admin layout', layout);
  const combinedAdmin = fixed ? layout : [...globalLayout, ...layout];

  clearContentKeepHeader(contentEl);
  const { gridEl, grid } = createAdminGrid(contentEl);
  gridEl.dataset.dashboardLayout = fixed ? 'fixed' : 'custom';
  exposeAdminGridGlobals(grid, page.id, lane, layout, !fixed);
  if (!fixed) bindAdminDropTarget(gridEl, grid);

  const instanceMetaMap = new Map<string, LayoutItem>();
  await mountAdminGridWidgets({
    gridEl,
    grid,
    layout: combinedAdmin,
    allWidgets,
    lane,
    widgetEmit,
    instanceMetaMap,
    editable: !fixed,
    debug
  });

  if (!fixed) await renderAttachedRuntimeContent({
    page,
    lane,
    allWidgets,
    container: contentEl,
    emit,
    widgetEmit
  });

  if (!fixed) bindAdminLayoutPersistence({
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
