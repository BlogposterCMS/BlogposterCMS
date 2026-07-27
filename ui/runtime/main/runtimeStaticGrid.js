import { init as initCanvasGrid } from './canvasGrid.js';
import { computeStaticGridMetrics, deriveGridSize } from './runtimeGridMetrics.js';
import { mountRuntimeGridStructuralItems, mountRuntimeGridWidgets, reflowRuntimeGridWidgets } from './runtimeGridWidgetMounting.js';
const noopWidgetEmit = async () => undefined;
function mergeResponsiveLayout(gridEl, layout, append) {
    const current = append && Array.isArray(gridEl.__runtimeResponsiveLayout)
        ? gridEl.__runtimeResponsiveLayout
        : [];
    const byId = new Map();
    [...current, ...layout].forEach((item, index) => {
        byId.set(String(item?.id || `runtime-item-${index}`), item);
    });
    gridEl.__runtimeResponsiveLayout = [...byId.values()];
}
function installStaticGridResponsiveReflow(gridEl, grid, fallbackLayout, manageGridHeight = true) {
    const requestFrame = typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(() => callback(Date.now()), 0);
    const cancelFrame = typeof window.cancelAnimationFrame === 'function'
        ? window.cancelAnimationFrame.bind(window)
        : window.clearTimeout.bind(window);
    const reflow = () => {
        gridEl.__runtimeResponsiveFrame = undefined;
        if (!gridEl.isConnected) {
            gridEl.__runtimeResponsiveObserver?.disconnect();
            return;
        }
        try {
            const layout = gridEl.__runtimeResponsiveLayout || fallbackLayout;
            const metrics = computeStaticGridMetrics(gridEl, layout);
            if (manageGridHeight)
                gridEl.style.height = `${metrics.height}px`;
            reflowRuntimeGridWidgets({
                gridEl,
                grid,
                scaleX: metrics.scaleX,
                scaleY: metrics.scaleY,
                percentDivisor: 1
            });
        }
        catch (error) {
            console.warn('RUNTIME_RESPONSIVE_REFLOW_FAILED', error);
        }
    };
    const schedule = () => {
        if (gridEl.__runtimeResponsiveFrame !== undefined) {
            cancelFrame(gridEl.__runtimeResponsiveFrame);
        }
        gridEl.__runtimeResponsiveFrame = requestFrame(reflow);
    };
    gridEl.__runtimeScheduleResponsiveReflow = schedule;
    if (!gridEl.__runtimeResponsiveObserver && typeof ResizeObserver !== 'undefined') {
        gridEl.__runtimeResponsiveObserver = new ResizeObserver(schedule);
        gridEl.__runtimeResponsiveObserver.observe(gridEl);
    }
    // The iframe or document surface can finish sizing after its first paint.
    // Always project once more on the next frame, even without a resize event.
    schedule();
}
export async function renderStaticRuntimeGrid(target, layout, allWidgets, lane, opts = {}) {
    if (!target)
        return { gridEl: null, grid: null };
    let { gridEl, grid, append = false } = opts;
    const structuralItems = Array.isArray(opts.structuralItems) ? opts.structuralItems : [];
    const widgetEmit = opts.widgetEmit || noopWidgetEmit;
    if (!append || !gridEl || !grid) {
        gridEl = opts.useTargetAsGrid ? target : document.createElement('div');
        gridEl.classList.add('canvas-grid');
        if (!opts.useTargetAsGrid)
            target.appendChild(gridEl);
        grid = initCanvasGrid({
            staticGrid: true,
            float: true,
            cellHeight: 1,
            columnWidth: 1,
            columns: Infinity,
            enableZoom: false,
            preservePixelWidgetSize: true,
        }, gridEl);
    }
    const projectionLayout = [
        ...structuralItems.map(entry => entry.item),
        ...layout
    ];
    mergeResponsiveLayout(gridEl, projectionLayout, append);
    const metrics = computeStaticGridMetrics(gridEl, projectionLayout);
    grid.options = grid.options || {};
    grid.options.columnWidth = 1;
    grid.options.cellHeight = 1;
    grid.options.columns = Infinity;
    grid.options.rows = Infinity;
    grid.options.preservePixelWidgetSize = true;
    if (!opts.useTargetAsGrid)
        gridEl.style.height = `${metrics.height}px`;
    mountRuntimeGridStructuralItems({
        grid,
        items: structuralItems,
        scaleX: metrics.scaleX,
        scaleY: metrics.scaleY,
        percentDivisor: 1
    });
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
    installStaticGridResponsiveReflow(gridEl, grid, projectionLayout, !opts.useTargetAsGrid);
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
        enableZoom: false,
        preservePixelWidgetSize: true
    }, gridEl);
    const { cols, rows } = deriveGridSize(gridEl, grid, layout);
    mergeResponsiveLayout(gridEl, layout, false);
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
    installStaticGridResponsiveReflow(gridEl, grid, layout);
}
