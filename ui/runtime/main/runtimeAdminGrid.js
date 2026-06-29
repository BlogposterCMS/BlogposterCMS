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
    let layout = await loadRuntimeLayoutForViewport(emit, page.id, lane);
    if (debug)
        console.debug('[Renderer] admin layout', layout);
    const combinedAdmin = [...globalLayout, ...layout];
    clearContentKeepHeader(contentEl);
    const { gridEl, grid } = createAdminGrid(contentEl);
    exposeAdminGridGlobals(grid, page.id, lane, layout);
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
