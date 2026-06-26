import { init as initCanvasGrid } from './canvasGrid.js';
import { computeStaticGridMetrics, deriveGridSize } from './runtimeGridMetrics.js';
import { mountRuntimeGridWidgets } from './runtimeGridWidgetMounting.js';
const noopWidgetEmit = async () => undefined;
export async function renderStaticRuntimeGrid(target, layout, allWidgets, lane, opts = {}) {
    if (!target)
        return { gridEl: null, grid: null };
    let { gridEl, grid, append = false } = opts;
    const widgetEmit = opts.widgetEmit || noopWidgetEmit;
    if (!append || !gridEl || !grid) {
        gridEl = document.createElement('div');
        gridEl.className = 'canvas-grid';
        target.appendChild(gridEl);
        grid = initCanvasGrid({
            staticGrid: true,
            float: true,
            cellHeight: 1,
            columnWidth: 1,
            columns: Infinity,
            enableZoom: false,
        }, gridEl);
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
export async function renderPublicRuntimeGrid(target, layout, allWidgets, lane, widgetEmit, debug = false) {
    const gridEl = document.createElement('div');
    gridEl.id = 'publicGrid';
    gridEl.className = 'canvas-grid';
    target.appendChild(gridEl);
    const grid = initCanvasGrid({
        staticGrid: true,
        float: true,
        cellHeight: 1,
        columnWidth: 1,
        enableZoom: false
    }, gridEl);
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
