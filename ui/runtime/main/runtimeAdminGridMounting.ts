import {
  createRuntimeCanvasItem,
  resolveRuntimeCanvasRect,
  type RuntimeCanvasItemMeta,
  type RuntimeCanvasRect
} from './runtimeCanvasItems.js';
import {
  DEFAULT_ADMIN_ROWS,
  deriveGridSize,
  type RendererGrid
} from './runtimeGridMetrics.js';
import type { RuntimeWidgetDefinition } from './runtimeWidgetRenderer.js';
import { renderRuntimeCanvasWidget } from './runtimeWidgetMounting.js';
import { waitForRuntimeWidgetShellPaint } from './runtimeWidgetHydration.js';
import type { RuntimeEmitter as RuntimeWidgetEmitter } from './runtimeWidgetInstances.js';
import { attachAdminDashboardControls } from './widgetRuntimeGateway.js';

export type RuntimeAdminGridLayoutItem = RuntimeCanvasItemMeta;

export type RuntimeAdminGridMountOptions = {
  gridEl: HTMLElement;
  grid: RendererGrid;
  layout: RuntimeAdminGridLayoutItem[];
  allWidgets: RuntimeWidgetDefinition[];
  lane: string;
  widgetEmit: RuntimeWidgetEmitter;
  instanceMetaMap: Map<string, RuntimeAdminGridLayoutItem>;
  deferHydration?: boolean;
  debug?: boolean;
};

const LEGACY_OVERSIZED_ADMIN_ROWS = 1000;
const RECOVERED_ADMIN_WIDGET_ROWS = 160;

function toFiniteNumber(value: unknown): number | null {
  const num = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(num) ? num : null;
}

function getSeedOptions(def: RuntimeWidgetDefinition): Record<string, any> {
  const seedOptions = def?.metadata?.seedOptions;
  return seedOptions && typeof seedOptions === 'object' && !Array.isArray(seedOptions)
    ? seedOptions
    : {};
}

function seedWidthToColumns(options: Record<string, any>, cols: number): number | null {
  const width = toFiniteNumber(options.width);
  const widthPercent = Number.isFinite(width)
    ? width
    : options.halfWidth
      ? 50
      : options.thirdWidth
        ? 33.333
        : null;
  if (!Number.isFinite(widthPercent)) return null;
  return Math.max(1, Math.min(cols, Math.round(((widthPercent as number) / 100) * cols)));
}

function slotWidthToColumns(def: RuntimeWidgetDefinition, cols: number): number | null {
  const contract = def?.metadata?.layout || def?.metadata?.sizeContract || def?.layout;
  const slots = Array.isArray(contract?.supportedSlots) ? contract.supportedSlots : [];
  const nonFullWidths = slots
    .filter((slot: Record<string, any>) => slot?.name !== 'full')
    .map((slot: Record<string, any>) => toFiniteNumber(slot.minCols))
    .filter((value: number | null): value is number => value !== null && value > 0);
  if (nonFullWidths.length) {
    return Math.max(1, Math.min(cols, Math.min(...nonFullWidths)));
  }
  return slots.some((slot: Record<string, any>) => slot?.name === 'full')
    ? cols
    : null;
}

function seedHeightToRows(options: Record<string, any>): number | null {
  const height = toFiniteNumber(options.height);
  return height !== null && height > 100
    ? Math.max(1, Math.round(height))
    : null;
}

function normalizeLegacyAdminRect(
  rect: RuntimeCanvasRect,
  meta: RuntimeAdminGridLayoutItem,
  def: RuntimeWidgetDefinition,
  cols: number
): RuntimeCanvasRect {
  const h = toFiniteNumber(rect.h);
  const hPercent = toFiniteNumber(meta.hPercent);
  const hasLegacyAbsolutePercent = hPercent !== null && hPercent > 100;
  const hasOversizedStoredRows = h !== null && h > LEGACY_OVERSIZED_ADMIN_ROWS;
  if (!hasLegacyAbsolutePercent && !hasOversizedStoredRows) {
    return rect;
  }

  const seedOptions = getSeedOptions(def);
  const seedHeight = seedHeightToRows(seedOptions);
  const seedWidth = seedWidthToColumns(seedOptions, cols) ?? slotWidthToColumns(def, cols);
  const x = toFiniteNumber(rect.x);
  const clampedX = seedWidth !== null && x !== null && x + seedWidth > cols
    ? Math.max(0, cols - seedWidth)
    : null;

  return {
    ...rect,
    ...(clampedX !== null ? { x: clampedX } : {}),
    ...(seedWidth !== null ? { w: seedWidth } : {}),
    h: seedHeight ?? RECOVERED_ADMIN_WIDGET_ROWS
  };
}

function createAdminInstanceMeta(entry: RuntimeAdminGridLayoutItem): {
  instanceId: string;
  meta: RuntimeAdminGridLayoutItem;
} {
  const meta = { ...entry };
  const instanceId =
    meta.id
    || meta.instance_id
    || meta.instanceId
    || `w${Math.random().toString(36).slice(2, 8)}`;
  meta.id = instanceId;
  return { instanceId: String(instanceId), meta };
}

export async function mountAdminGridWidgets({
  gridEl,
  grid,
  layout,
  allWidgets,
  lane,
  widgetEmit,
  instanceMetaMap,
  deferHydration = true,
  debug = false
}: RuntimeAdminGridMountOptions): Promise<void> {
  const pendingAdmin: Array<{
    wrapper: HTMLElement;
    def: RuntimeWidgetDefinition;
    meta: RuntimeAdminGridLayoutItem;
    placeholder: HTMLElement;
  }> = [];
  const { cols, rows } = deriveGridSize(gridEl, grid, layout);

  for (const entry of layout) {
    const def = allWidgets.find(widget => widget.id === entry.widgetId);
    if (!def) continue;
    if (debug) console.debug('[Renderer] admin render widget placeholder', def.id);
    const { instanceId, meta } = createAdminInstanceMeta(entry);
    const rect = normalizeLegacyAdminRect(resolveRuntimeCanvasRect(meta, {
      scaleX: cols,
      scaleY: rows,
      defaultH: DEFAULT_ADMIN_ROWS,
      def,
      heightProjectionMode: 'legacyAdminPixels'
    }), meta, def, cols);
    const { wrapper, placeholder } = createRuntimeCanvasItem({
      def,
      item: meta,
      ...rect,
      minW: 4,
      minH: DEFAULT_ADMIN_ROWS,
      instanceId,
      includeLayoutMetadata: true
    });

    gridEl.appendChild(wrapper);
    grid.makeWidget(wrapper);
    instanceMetaMap.set(instanceId, meta);
    pendingAdmin.push({ wrapper, def, meta, placeholder });
  }

  if (pendingAdmin.length && deferHydration) {
    await waitForRuntimeWidgetShellPaint();
  }

  for (const { wrapper, def, meta, placeholder } of pendingAdmin) {
    await renderRuntimeCanvasWidget({
      wrapper,
      placeholder,
      item: meta,
      def,
      grid,
      emit: widgetEmit,
      lane,
      afterRender: attachAdminDashboardControls
    });
  }
}
