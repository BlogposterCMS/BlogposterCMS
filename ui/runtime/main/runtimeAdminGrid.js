import { init as initCanvasGrid } from './canvasGrid.js';
import { clearContentKeepHeader } from './runtimePageShell.js';
import { loadRuntimeLayoutForViewport } from './runtimePageData.js';
import { renderAttachedRuntimeContent } from './runtimeAttachedContent.js';
import { mountAdminGridWidgets } from './runtimeAdminGridMounting.js';
import { ADMIN_COLUMN_COUNT, bindAdminDropTarget, bindAdminLayoutPersistence, bindResponsiveAdminColumns, exposeAdminGridGlobals } from './runtimeAdminGridInteractions.js';
function createAdminGrid(contentEl) {
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
    }, gridEl);
    grid.options = grid.options || {};
    return { gridEl, grid };
}
export async function renderAdminRuntimeGrid({ page, contentEl, globalLayout = [], allWidgets, lane, emit, widgetEmit, debug = false }) {
    let layout = await loadRuntimeLayoutForViewport(emit, page.id, lane);
    if (debug)
        console.debug('[Renderer] admin layout', layout);
    const combinedAdmin = [...globalLayout, ...layout];
    clearContentKeepHeader(contentEl);
    const { gridEl, grid } = createAdminGrid(contentEl);
    bindResponsiveAdminColumns(gridEl, grid);
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
