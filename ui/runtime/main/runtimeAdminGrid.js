import { clearContentKeepHeader } from './runtimePageShell.js';
import { loadRuntimeLayoutForViewport } from './runtimePageData.js';
import { renderAttachedRuntimeContent } from './runtimeAttachedContent.js';
import { mountAdminGridWidgets } from './runtimeAdminGridMounting.js';
import { ADMIN_COLUMN_COUNT, bindAdminDropTarget, bindAdminLayoutPersistence, createAdminDashboardController, exposeAdminGridGlobals } from './runtimeAdminGridInteractions.js';
function createAdminGrid(contentEl) {
    const gridEl = document.createElement('div');
    gridEl.id = 'adminGrid';
    gridEl.className = 'canvas-grid dashboard-grid';
    gridEl.style.setProperty('--dashboard-columns', String(ADMIN_COLUMN_COUNT));
    contentEl.appendChild(gridEl);
    const grid = createAdminDashboardController(gridEl);
    return { gridEl, grid };
}
export async function renderAdminRuntimeGrid({ page, contentEl, globalLayout = [], allWidgets, lane, emit, widgetEmit, debug = false }) {
    const fixed = page.meta?.dashboardLayout === 'fixed';
    // Fixed CMS tools still use the normal widget loader and module contracts.
    // Their composition comes from the page owner, not personal dashboard slots.
    const layout = fixed
        ? (page.meta.widgets || []).map((widgetId, index) => ({
            id: `workspace-${page.id}-${widgetId}`,
            widgetId,
            slot: page.meta.widgetSlots?.[widgetId] || 'page',
            order: index * 10
        }))
        : await loadRuntimeLayoutForViewport(emit, page.id, lane);
    if (debug)
        console.debug('[Renderer] admin layout', layout);
    const combinedAdmin = fixed ? layout : [...globalLayout, ...layout];
    clearContentKeepHeader(contentEl);
    const { gridEl, grid } = createAdminGrid(contentEl);
    gridEl.dataset.dashboardLayout = fixed ? 'fixed' : 'custom';
    exposeAdminGridGlobals(grid, page.id, lane, layout, !fixed);
    if (!fixed)
        bindAdminDropTarget(gridEl, grid);
    const instanceMetaMap = new Map();
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
    if (!fixed)
        await renderAttachedRuntimeContent({
            page,
            lane,
            allWidgets,
            container: contentEl,
            emit,
            widgetEmit
        });
    if (!fixed)
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
