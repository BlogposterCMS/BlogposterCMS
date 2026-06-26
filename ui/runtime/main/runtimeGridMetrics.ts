type LooseRecord = Record<string, any>;

export const DEFAULT_ADMIN_ROWS = 100;

export type RuntimeLayoutItem = LooseRecord;
export type RendererGrid = LooseRecord & {
  options?: LooseRecord;
  refreshMetrics?: () => GridMetrics;
};

export interface GridMetrics {
  width: number;
  height: number;
  paddingLeft: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
}

export interface StaticGridMetrics {
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
}

function toNumberSafe(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function deriveGridSize(
  gridEl: HTMLElement,
  grid: RendererGrid | null | undefined,
  items: RuntimeLayoutItem[] = []
): { cols: number; rows: number } {
  const metrics = measureGridMetrics(gridEl, grid);
  const colWidth = grid?.options?.columnWidth || 1;
  let cols = Number.isFinite(grid?.options?.columns)
    ? grid?.options?.columns
    : Math.round((metrics.width || 0) / colWidth);
  if (!cols || !Number.isFinite(cols)) cols = 12;

  const cellH = grid?.options?.cellHeight || 1;
  let rows = Math.round((metrics.height || 0) / cellH);
  if (!rows || !Number.isFinite(rows)) {
    const maxPercent = items.reduce((max: number, item: RuntimeLayoutItem) => {
      const y = toNumberSafe(item?.yPercent);
      const h = toNumberSafe(item?.hPercent);
      const total = Math.max(0, y) + Math.max(0, h);
      return Math.max(max, total);
    }, 100);
    const baseline = Number.isFinite(maxPercent) ? maxPercent : 100;
    const widthPx = Math.max(cols * colWidth, 0);
    const approximateHeightPx = (baseline / 100) * widthPx;
    const estimatedRows = cellH
      ? approximateHeightPx / cellH
      : approximateHeightPx;
    const fallbackRows = Number.isFinite(estimatedRows)
      ? Math.round(estimatedRows)
      : DEFAULT_ADMIN_ROWS;
    rows = Math.max(DEFAULT_ADMIN_ROWS, fallbackRows);
  }
  return { cols, rows };
}

export function measureGridMetrics(
  gridEl: HTMLElement,
  grid?: RendererGrid | null
): GridMetrics {
  if (grid && typeof grid.refreshMetrics === 'function') {
    return grid.refreshMetrics();
  }
  const style = getComputedStyle(gridEl);
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  let width = (gridEl.clientWidth || 0) - paddingLeft - paddingRight;
  let height = (gridEl.clientHeight || 0) - paddingTop - paddingBottom;
  if (!Number.isFinite(width) || width <= 0) {
    const rect = gridEl.getBoundingClientRect();
    width = Math.max(rect.width - paddingLeft - paddingRight, 0);
  }
  if (!Number.isFinite(height) || height <= 0) {
    const rect = gridEl.getBoundingClientRect();
    height = Math.max(rect.height - paddingTop - paddingBottom, 0);
  }
  return { width, height, paddingLeft, paddingTop, paddingRight, paddingBottom };
}

export function computeStaticGridMetrics(
  gridEl: HTMLElement,
  layout: RuntimeLayoutItem[] = []
): StaticGridMetrics {
  const width = gridEl?.getBoundingClientRect()?.width || gridEl?.clientWidth || 1;
  const maxPercent = layout.reduce(
    (max: number, item: RuntimeLayoutItem) => Math.max(
      max,
      (Number(item.yPercent) || 0) + (Number(item.hPercent) || 0)
    ),
    100
  );
  const clampedPercent = Math.max(100, Math.min(1000, Math.round(maxPercent)));
  const height = Math.max(1, (clampedPercent / 100) * width);
  const scaleX = width / 100;
  const scaleY = height / 100;
  return {
    width,
    height,
    scaleX,
    scaleY,
  };
}
