const DEFAULT_COLUMNS = 12;
const DEFAULT_VERTICAL_UNITS = 12;
const REPLAY_INTERVAL_MS = 32;
const MAX_REPLAY_ATTEMPTS = 30;
const pendingPercentReplays = new WeakMap();
function coercePercent(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}
function isPositiveNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
function percentToUnits(percent, totalUnits) {
    if (!Number.isFinite(percent) || !Number.isFinite(totalUnits) || totalUnits <= 0) {
        return 1;
    }
    return Math.max(1, Math.round((percent / 100) * totalUnits));
}
function getGridDimension(grid, dimension, metrics) {
    if (!grid)
        return 0;
    const metricValue = metrics?.[dimension];
    if (isPositiveNumber(metricValue)) {
        return metricValue;
    }
    const el = grid.el;
    if (!el)
        return 0;
    const client = dimension === 'width' ? el.clientWidth : el.clientHeight;
    if (isPositiveNumber(client)) {
        return client;
    }
    const offset = dimension === 'width' ? el.offsetWidth : el.offsetHeight;
    if (isPositiveNumber(offset)) {
        return offset;
    }
    try {
        const rect = el.getBoundingClientRect?.();
        const rectValue = dimension === 'width' ? rect?.width : rect?.height;
        if (isPositiveNumber(rectValue)) {
            return rectValue;
        }
    }
    catch {
        /* ignore measurement failures */
    }
    return 0;
}
function getColumnCount(grid, metrics) {
    if (!grid)
        return DEFAULT_COLUMNS;
    const { columns, columnWidth } = grid.options || {};
    if (Number.isFinite(columns) && columns > 0) {
        return columns;
    }
    const width = getGridDimension(grid, 'width', metrics);
    const colWidth = isPositiveNumber(columnWidth) ? columnWidth : 0;
    if (width > 0 && colWidth > 0) {
        const derived = Math.max(1, Math.round(width / colWidth));
        if (isPositiveNumber(derived)) {
            return derived;
        }
    }
    return DEFAULT_COLUMNS;
}
function getRowBaseline(grid, columns, metrics) {
    if (!grid)
        return Math.max(columns, DEFAULT_VERTICAL_UNITS);
    const { rows, percentRows, cellHeight } = grid.options || {};
    if (Number.isFinite(rows) && rows > 0) {
        return rows;
    }
    if (Number.isFinite(percentRows) && percentRows > 0) {
        return percentRows;
    }
    const height = getGridDimension(grid, 'height', metrics);
    const unitHeight = isPositiveNumber(cellHeight) ? cellHeight : 0;
    if (height > 0 && unitHeight > 0) {
        const derived = Math.max(1, Math.round(height / unitHeight));
        if (isPositiveNumber(derived)) {
            return derived;
        }
    }
    return Math.max(columns, DEFAULT_VERTICAL_UNITS);
}
function computePercentUpdate(grid, wPercent, hPercent) {
    const update = {};
    if (!grid)
        return update;
    const metrics = refreshGridMetrics(grid);
    const columns = getColumnCount(grid, metrics);
    if (wPercent != null) {
        update.w = percentToUnits(wPercent, columns);
    }
    if (hPercent != null) {
        const rows = getRowBaseline(grid, columns, metrics);
        update.h = percentToUnits(hPercent, rows);
    }
    return update;
}
function refreshGridMetrics(grid) {
    if (!grid || typeof grid.refreshMetrics !== 'function') {
        return null;
    }
    try {
        return grid.refreshMetrics() || null;
    }
    catch {
        return null;
    }
}
function metricsReady(metrics) {
    if (!metrics)
        return false;
    const widthReady = metrics.width == null || (typeof metrics.width === 'number' && Number.isFinite(metrics.width) && metrics.width > 0);
    const heightReady = metrics.height == null || (typeof metrics.height === 'number' && Number.isFinite(metrics.height) && metrics.height > 0);
    return widthReady && heightReady;
}
function replayPercentSizing(grid, widget) {
    const wPercent = coercePercent(widget.dataset.wPercent);
    const hPercent = coercePercent(widget.dataset.hPercent);
    if (wPercent == null && hPercent == null)
        return;
    const next = computePercentUpdate(grid, wPercent, hPercent);
    if (next.w == null && next.h == null)
        return;
    grid.update(widget, next);
}
function schedulePercentReplay(grid, widget) {
    if (!grid)
        return;
    let state = pendingPercentReplays.get(grid);
    if (!state) {
        state = { widgets: new Set(), timer: null, attempts: 0 };
        pendingPercentReplays.set(grid, state);
    }
    state.widgets.add(widget);
    if (state.timer)
        return;
    const tick = () => {
        state.timer = null;
        const metrics = refreshGridMetrics(grid);
        if (!metricsReady(metrics) && state.attempts < MAX_REPLAY_ATTEMPTS) {
            state.attempts += 1;
            state.timer = setTimeout(tick, REPLAY_INTERVAL_MS);
            return;
        }
        state.attempts = 0;
        state.widgets.forEach(w => replayPercentSizing(grid, w));
        state.widgets.clear();
    };
    state.timer = setTimeout(tick, REPLAY_INTERVAL_MS);
}
export function applyWidgetOptions(wrapper, opts = {}, grid) {
    if (!wrapper || !opts)
        return;
    const debug = Boolean(opts.debug ?? grid?.options?.debug);
    if (debug) {
        console.debug('[widgetOptions] opts', opts);
    }
    const applyPercentStyle = (value, prop) => {
        if (value == null)
            return;
        wrapper.style[prop] = `${value}%`;
    };
    const maxPercent = coercePercent(opts.max);
    if (maxPercent != null) {
        wrapper.classList.add('max');
        applyPercentStyle(maxPercent, 'maxWidth');
        applyPercentStyle(maxPercent, 'maxHeight');
    }
    const maxWidthPercent = coercePercent(opts.maxWidth);
    if (maxWidthPercent != null) {
        wrapper.classList.add('max-width');
        applyPercentStyle(maxWidthPercent, 'maxWidth');
    }
    const maxHeightPercent = coercePercent(opts.maxHeight);
    if (maxHeightPercent != null) {
        wrapper.classList.add('max-height');
        applyPercentStyle(maxHeightPercent, 'maxHeight');
    }
    let wPercent = null;
    let hPercent = null;
    if (opts.halfWidth) {
        wrapper.classList.add('half-width');
        wPercent = 50;
    }
    if (opts.thirdWidth) {
        wrapper.classList.add('third-width');
        wPercent = 33.333;
    }
    if (typeof opts.width === 'number' && Number.isFinite(opts.width)) {
        wPercent = opts.width;
    }
    if (typeof opts.height === 'number' && Number.isFinite(opts.height)) {
        hPercent = opts.height;
    }
    if (wPercent != null)
        wrapper.dataset.wPercent = String(wPercent);
    if (hPercent != null)
        wrapper.dataset.hPercent = String(hPercent);
    const enableOverflow = opts.overflow !== false;
    const contentEl = wrapper.querySelector('.canvas-item-content');
    if (enableOverflow) {
        wrapper.classList.add('overflow');
        contentEl?.classList.add('overflow');
    }
    else {
        wrapper.classList.remove('overflow');
        contentEl?.classList.remove('overflow');
    }
    if (!grid)
        return;
    const metrics = refreshGridMetrics(grid);
    const update = computePercentUpdate(grid, wPercent, hPercent);
    if (debug) {
        console.debug('[widgetOptions] percent update', {
            columns: getColumnCount(grid),
            update,
            wPercent,
            hPercent,
            metrics
        });
    }
    const hasPercentUpdate = update.w != null || update.h != null;
    if (hasPercentUpdate) {
        grid.update(wrapper, update);
        if (!metricsReady(metrics)) {
            schedulePercentReplay(grid, wrapper);
        }
    }
    else {
        grid.update(wrapper, {});
    }
}
