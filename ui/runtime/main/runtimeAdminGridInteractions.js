import { serializeRuntimeCanvasLayout } from './runtimeCanvasSerialization.js';
import { measureGridMetrics } from './runtimeGridMetrics.js';
import { saveRuntimeLayoutForViewport } from './runtimePageData.js';
export const ADMIN_COLUMN_COUNT = 12;
const COLUMN_EPSILON = 0.01;
export function bindResponsiveAdminColumns(gridEl, grid, columnCount = ADMIN_COLUMN_COUNT) {
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
        grid.widgets.forEach((widget) => grid.update(widget, {}, { silent: true }));
    };
    const handleResize = () => {
        if (resizeRaf)
            return;
        resizeRaf = window.requestAnimationFrame(() => {
            resizeRaf = 0;
            setColumnWidth();
        });
    };
    setColumnWidth();
    window.addEventListener('resize', handleResize);
}
export function bindAdminDropTarget(gridEl, grid) {
    gridEl.addEventListener('dragover', (event) => {
        if (!document.body.classList.contains('dashboard-edit-mode'))
            return;
        event.preventDefault();
    });
    gridEl.addEventListener('drop', (event) => {
        if (!document.body.classList.contains('dashboard-edit-mode'))
            return;
        event.preventDefault();
        const id = event.dataTransfer?.getData('text/plain');
        if (!id)
            return;
        const widgets = Array.isArray(window.availableWidgets)
            ? window.availableWidgets
            : [];
        const def = widgets.find((widget) => widget.id === id);
        if (!def || typeof window.addDashboardWidget !== 'function')
            return;
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
export function exposeAdminGridGlobals(grid, pageId, lane, layout) {
    grid.setStatic(true);
    document.body.classList.add('grid-mode');
    grid.on('change', () => { });
    window.adminGrid = grid;
    if (typeof grid.on === 'function') {
        grid.on('dragstart', (el) => el.classList.add('dragging'));
        grid.on('dragstop', (el) => el.classList.remove('dragging'));
    }
    window.adminPageContext = { pageId, lane };
    window.adminCurrentLayout = layout;
}
export function bindAdminLayoutPersistence({ grid, gridEl, instanceMetaMap, layout, pageId, lane, emit }) {
    let persistedLayout = layout;
    grid.on('change', () => {
        window.adminCurrentLayout = serializeRuntimeCanvasLayout(gridEl, instanceId => instanceMetaMap.get(instanceId)
            || persistedLayout.find((item) => item.id === instanceId)
            || {});
    });
    window.saveAdminLayout = async () => {
        if (!window.adminCurrentLayout)
            return;
        try {
            await saveRuntimeLayoutForViewport(emit, pageId, lane, window.adminCurrentLayout);
            persistedLayout = window.adminCurrentLayout;
        }
        catch (err) {
            console.error('[Admin] Layout save error:', err);
        }
    };
}
