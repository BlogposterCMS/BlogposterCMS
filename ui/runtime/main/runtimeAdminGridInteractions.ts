import {
  serializeRuntimeCanvasLayout,
  type RuntimeCanvasItemMeta
} from './runtimeCanvasSerialization.js';
import {
  measureGridMetrics,
  type RendererGrid
} from './runtimeGridMetrics.js';
import {
  saveRuntimeLayoutForViewport,
  type RuntimeEmitter as RuntimeDataEmitter
} from './runtimePageData.js';

type LayoutItem = RuntimeCanvasItemMeta;

export const ADMIN_COLUMN_COUNT = 12;

const COLUMN_EPSILON = 0.01;

export type RuntimeAdminLayoutPersistenceOptions = {
  grid: RendererGrid;
  gridEl: HTMLElement;
  instanceMetaMap: Map<string, LayoutItem>;
  layout: LayoutItem[];
  pageId: unknown;
  lane: string;
  emit: RuntimeDataEmitter;
};

export function bindResponsiveAdminColumns(
  gridEl: HTMLElement,
  grid: RendererGrid,
  columnCount = ADMIN_COLUMN_COUNT
): void {
  let lastAppliedColumnUnit = Math.max(1, grid?.options?.columnWidth || 0);
  let resizeRaf = 0;
  const setColumnWidth = () => {
    const metrics = measureGridMetrics(gridEl, grid);
    const width = metrics.width || gridEl.getBoundingClientRect().width;
    const nextWidth = Math.max(width, columnCount);
    const nextUnit = Math.max(1, nextWidth / columnCount);
    if (Math.abs(nextUnit - lastAppliedColumnUnit) < COLUMN_EPSILON) {
      return;
    }
    lastAppliedColumnUnit = nextUnit;
    const gridOptions = grid.options || (grid.options = {});
    gridOptions.columnWidth = nextUnit;
    grid.widgets.forEach((widget: HTMLElement) => grid.update(widget, {}, { silent: true }));
  };
  const handleResize = () => {
    if (resizeRaf) return;
    resizeRaf = window.requestAnimationFrame(() => {
      resizeRaf = 0;
      setColumnWidth();
    });
  };

  setColumnWidth();
  window.addEventListener('resize', handleResize);
}

export function bindAdminDropTarget(gridEl: HTMLElement, grid: RendererGrid): void {
  gridEl.addEventListener('dragover', (event: DragEvent) => {
    if (!document.body.classList.contains('dashboard-edit-mode')) return;
    event.preventDefault();
  });

  gridEl.addEventListener('drop', (event: DragEvent) => {
    if (!document.body.classList.contains('dashboard-edit-mode')) return;
    event.preventDefault();
    const id = event.dataTransfer?.getData('text/plain');
    if (!id) return;
    const widgets = Array.isArray(window.availableWidgets)
      ? window.availableWidgets
      : [];
    const def = widgets.find((widget: any) => widget.id === id);
    if (!def || typeof window.addDashboardWidget !== 'function') return;

    const rect = gridEl.getBoundingClientRect();
    const metrics = measureGridMetrics(gridEl, grid);
    const padLeft = metrics.paddingLeft || 0;
    const padTop = metrics.paddingTop || 0;
    const gridOptions = grid.options || (grid.options = {});
    const colWidth = gridOptions.columnWidth || 1;
    const rowHeight = gridOptions.cellHeight || 1;
    const rawX = Math.floor((event.clientX - rect.left - padLeft) / colWidth);
    const rawY = Math.floor((event.clientY - rect.top - padTop) / rowHeight);
    const x = Math.max(0, rawX);
    const y = Math.max(0, rawY);
    window.addDashboardWidget(def, { x, y });
  });
}

export function exposeAdminGridGlobals(
  grid: RendererGrid,
  pageId: unknown,
  lane: string,
  layout: LayoutItem[]
): void {
  grid.setStatic(true);
  document.body.classList.add('grid-mode');
  grid.on('change', () => {});
  window.adminGrid = grid;
  if (typeof grid.on === 'function') {
    grid.on('dragstart', (el: HTMLElement) => el.classList.add('dragging'));
    grid.on('dragstop', (el: HTMLElement) => el.classList.remove('dragging'));
  }
  window.adminPageContext = { pageId, lane };
  window.adminCurrentLayout = layout;
}

export function bindAdminLayoutPersistence({
  grid,
  gridEl,
  instanceMetaMap,
  layout,
  pageId,
  lane,
  emit
}: RuntimeAdminLayoutPersistenceOptions): void {
  let persistedLayout = layout;

  grid.on('change', () => {
    window.adminCurrentLayout = serializeRuntimeCanvasLayout(
      gridEl,
      instanceId => instanceMetaMap.get(instanceId)
        || persistedLayout.find((item: LayoutItem) => item.id === instanceId)
        || {}
    );
  });

  window.saveAdminLayout = async () => {
    if (!window.adminCurrentLayout) return;
    try {
      await saveRuntimeLayoutForViewport(
        emit,
        pageId,
        lane,
        window.adminCurrentLayout
      );
      persistedLayout = window.adminCurrentLayout;
    } catch (err) {
      console.error('[Admin] Layout save error:', err);
    }
  };
}
