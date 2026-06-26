export type GridUpdateOpts = {
  w?: number;
  h?: number;
  x?: number;
  y?: number;
  layer?: number;
  locked?: boolean;
  noMove?: boolean;
  noResize?: boolean;
};

export type GridMetrics = {
  width?: number;
  height?: number;
};

export type GridLike = {
  el: HTMLElement;
  options: {
    debug?: boolean;
    columnWidth?: number;
    cellHeight?: number;
    columns?: number;
    rows?: number;
    percentRows?: number;
  };
  update: (el: HTMLElement, opts?: GridUpdateOpts, meta?: Record<string, unknown>) => void;
  refreshMetrics?: () => GridMetrics | null | undefined;
};

const DEFAULT_COLUMNS = 12;
const DEFAULT_VERTICAL_UNITS = 12;
const REPLAY_INTERVAL_MS = 32;
const MAX_REPLAY_ATTEMPTS = 30;
const ABSOLUTE_HEIGHT_THRESHOLD = 100;

const pendingPercentReplays = new WeakMap<
  GridLike,
  { widgets: Set<HTMLElement>; timer: ReturnType<typeof setTimeout> | null; attempts: number }
>();

export function coercePercent(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function percentToUnits(percent: number, totalUnits: number): number {
  if (!Number.isFinite(percent) || !Number.isFinite(totalUnits) || totalUnits <= 0) {
    return 1;
  }
  return Math.max(1, Math.round((percent / 100) * totalUnits));
}

export function heightOptionToUnits(value: number, totalUnits: number): number {
  if (!Number.isFinite(value)) return 1;
  // Seeded admin widgets historically store compact pixel heights such as 160
  // in the same option field as percentages. Keep <=100 as percent, but avoid
  // treating 150/160/620 as viewport-relative heights.
  if (value > ABSOLUTE_HEIGHT_THRESHOLD) {
    return Math.max(1, Math.round(value));
  }
  return percentToUnits(value, totalUnits);
}

function getGridDimension(
  grid: GridLike | undefined,
  dimension: 'width' | 'height',
  metrics?: GridMetrics | null
): number {
  if (!grid) return 0;
  const metricValue = metrics?.[dimension];
  if (isPositiveNumber(metricValue)) {
    return metricValue;
  }

  const el = grid.el;
  if (!el) return 0;

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
  } catch {
    /* ignore measurement failures */
  }

  return 0;
}

export function getColumnCount(grid: GridLike | undefined, metrics?: GridMetrics | null): number {
  if (!grid) return DEFAULT_COLUMNS;
  const { columns, columnWidth } = grid.options || {};
  if (Number.isFinite(columns) && (columns as number) > 0) {
    return columns as number;
  }

  const width = getGridDimension(grid, 'width', metrics);
  const colWidth = isPositiveNumber(columnWidth) ? (columnWidth as number) : 0;
  if (width > 0 && colWidth > 0) {
    const derived = Math.max(1, Math.round(width / colWidth));
    if (isPositiveNumber(derived)) {
      return derived;
    }
  }

  return DEFAULT_COLUMNS;
}

function getRowBaseline(
  grid: GridLike | undefined,
  columns: number,
  metrics?: GridMetrics | null
): number {
  if (!grid) return Math.max(columns, DEFAULT_VERTICAL_UNITS);
  const { rows, percentRows, cellHeight } = grid.options || {};
  if (Number.isFinite(rows) && (rows as number) > 0) {
    return rows as number;
  }
  if (Number.isFinite(percentRows) && (percentRows as number) > 0) {
    return percentRows as number;
  }

  const height = getGridDimension(grid, 'height', metrics);
  const unitHeight = isPositiveNumber(cellHeight) ? (cellHeight as number) : 0;
  if (height > 0 && unitHeight > 0) {
    const derived = Math.max(1, Math.round(height / unitHeight));
    if (isPositiveNumber(derived)) {
      return derived;
    }
  }

  return Math.max(columns, DEFAULT_VERTICAL_UNITS);
}

export function computePercentUpdate(
  grid: GridLike | undefined,
  wPercent: number | null,
  hPercent: number | null
): GridUpdateOpts {
  const update: GridUpdateOpts = {};
  if (!grid) return update;
  const metrics = refreshGridMetrics(grid);
  const columns = getColumnCount(grid, metrics);
  if (wPercent != null) {
    update.w = percentToUnits(wPercent, columns);
  }
  if (hPercent != null) {
    const rows = getRowBaseline(grid, columns, metrics);
    update.h = heightOptionToUnits(hPercent, rows);
  }
  return update;
}

export function refreshGridMetrics(grid: GridLike | undefined): GridMetrics | null {
  if (!grid || typeof grid.refreshMetrics !== 'function') {
    return null;
  }
  try {
    return grid.refreshMetrics() || null;
  } catch {
    return null;
  }
}

export function metricsReady(metrics: GridMetrics | null): boolean {
  if (!metrics) return false;
  const widthReady =
    metrics.width == null || (typeof metrics.width === 'number' && Number.isFinite(metrics.width) && metrics.width > 0);
  const heightReady =
    metrics.height == null || (typeof metrics.height === 'number' && Number.isFinite(metrics.height) && metrics.height > 0);
  return widthReady && heightReady;
}

function replayPercentSizing(grid: GridLike, widget: HTMLElement): void {
  const wPercent = coercePercent(widget.dataset.wPercent);
  const hPercent = coercePercent(widget.dataset.hPercent);
  if (wPercent == null && hPercent == null) return;
  const next = computePercentUpdate(grid, wPercent, hPercent);
  if (next.w == null && next.h == null) return;
  grid.update(widget, next);
}

export function schedulePercentReplay(grid: GridLike, widget: HTMLElement): void {
  if (!grid) return;
  let state = pendingPercentReplays.get(grid);
  if (!state) {
    state = { widgets: new Set<HTMLElement>(), timer: null, attempts: 0 };
    pendingPercentReplays.set(grid, state);
  }
  state.widgets.add(widget);
  if (state.timer) return;

  const tick = () => {
    state!.timer = null;
    const metrics = refreshGridMetrics(grid);
    if (!metricsReady(metrics) && state!.attempts < MAX_REPLAY_ATTEMPTS) {
      state!.attempts += 1;
      state!.timer = setTimeout(tick, REPLAY_INTERVAL_MS);
      return;
    }
    state!.attempts = 0;
    state!.widgets.forEach(w => replayPercentSizing(grid, w));
    state!.widgets.clear();
  };

  state.timer = setTimeout(tick, REPLAY_INTERVAL_MS);
}
