import {
  createWidgetPlaceholder,
  type RuntimeCanvasItemMeta
} from './runtimeCanvasItems.js';
import type { RuntimeWidgetDefinition } from './runtimeWidgetRenderer.js';
import { renderRuntimeCanvasWidget } from './runtimeWidgetMounting.js';
import { waitForRuntimeWidgetShellPaint } from './runtimeWidgetHydration.js';
import { markRuntimeWidgetShell } from './runtimeWidgetHydration.js';
import type { RuntimeEmitter as RuntimeWidgetEmitter } from './runtimeWidgetInstances.js';
import { attachAdminDashboardControls } from './widgetRuntimeGateway.js';
import {
  applyDashboardHeightPolicyToElement,
  applyDashboardSlotToElement,
  getDefaultDashboardSlot,
  getSupportedDashboardSlots,
  resolveDashboardSlotForWidget
} from '../../shared/layout/dashboardSlots.js';

type LooseRecord = Record<string, any>;

export type RuntimeAdminGridLayoutItem = RuntimeCanvasItemMeta & {
  order?: number;
  slot?: string;
  column?: number;
  breakpoints?: Record<string, string>;
};

export type RuntimeAdminGridMountOptions = {
  gridEl: HTMLElement;
  grid: LooseRecord | null | undefined;
  layout: RuntimeAdminGridLayoutItem[];
  allWidgets: RuntimeWidgetDefinition[];
  lane: string;
  widgetEmit: RuntimeWidgetEmitter;
  instanceMetaMap: Map<string, RuntimeAdminGridLayoutItem>;
  deferHydration?: boolean;
  debug?: boolean;
};

function toFiniteNumber(value: unknown): number | null {
  const num = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(num) ? num : null;
}

function findWidgetDefinition(
  allWidgets: RuntimeWidgetDefinition[],
  widgetId: unknown
): RuntimeWidgetDefinition | null {
  return allWidgets.find(widget => widget.id === widgetId) || null;
}

function createAdminInstanceMeta(
  entry: RuntimeAdminGridLayoutItem,
  index: number,
  def: RuntimeWidgetDefinition
): {
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
  meta.widgetId = meta.widgetId || def.id;
  meta.order = toFiniteNumber(meta.order) ?? index * 10;
  meta.slot = resolveDashboardSlotForWidget(def, meta.slot);
  meta.column = toFiniteNumber(meta.column) ?? undefined;
  return { instanceId: String(instanceId), meta };
}

function normalizeDashboardEntries(
  layout: RuntimeAdminGridLayoutItem[],
  allWidgets: RuntimeWidgetDefinition[]
): Array<{
  def: RuntimeWidgetDefinition;
  index: number;
  entry: RuntimeAdminGridLayoutItem;
}> {
  const entries = layout
    .map((entry, index) => ({
      entry,
      index,
      def: findWidgetDefinition(allWidgets, entry.widgetId)
    }))
    .filter((item): item is {
      def: RuntimeWidgetDefinition;
      index: number;
      entry: RuntimeAdminGridLayoutItem;
    } => Boolean(item.def))
    .sort((a, b) => {
      const aOrder = toFiniteNumber(a.entry.order) ?? a.index * 10;
      const bOrder = toFiniteNumber(b.entry.order) ?? b.index * 10;
      return aOrder - bOrder;
    });

  const pageEntry = entries.find(item => (
    resolveDashboardSlotForWidget(item.def, item.entry.slot) === 'page'
  ));
  return pageEntry ? [pageEntry] : entries;
}

function createAdminDashboardItem(
  def: RuntimeWidgetDefinition,
  meta: RuntimeAdminGridLayoutItem,
  instanceId: string
): { wrapper: HTMLElement; placeholder: HTMLElement } {
  const wrapper = document.createElement('article');
  wrapper.classList.add('canvas-item', 'dashboard-widget', 'loading');
  wrapper.dataset.widgetId = def.id;
  wrapper.dataset.instanceId = instanceId;
  wrapper.dataset.dashboardOrder = String(meta.order ?? 0);
  wrapper.style.order = String(meta.order ?? 0);
  applyDashboardSlotToElement(
    wrapper,
    resolveDashboardSlotForWidget(def, meta.slot),
    getSupportedDashboardSlots(def),
    meta.column
  );
  applyDashboardHeightPolicyToElement(wrapper, def);

  const placeholder = createWidgetPlaceholder(def);
  wrapper.appendChild(placeholder);
  markRuntimeWidgetShell(wrapper, placeholder);
  return { wrapper, placeholder };
}

export function createAdminDashboardWidgetElement(
  def: RuntimeWidgetDefinition,
  meta: RuntimeAdminGridLayoutItem = {},
  index = 0
): {
  wrapper: HTMLElement;
  placeholder: HTMLElement;
  meta: RuntimeAdminGridLayoutItem;
  instanceId: string;
} {
  const normalizedMeta: RuntimeAdminGridLayoutItem = {
    ...meta,
    widgetId: meta.widgetId || def.id,
    slot: resolveDashboardSlotForWidget(def, meta.slot || getDefaultDashboardSlot(def)),
    column: toFiniteNumber(meta.column) ?? undefined,
    order: toFiniteNumber(meta.order) ?? index * 10
  };
  const instanceId = String(
    normalizedMeta.id
    || normalizedMeta.instance_id
    || normalizedMeta.instanceId
    || `w${Math.random().toString(36).slice(2, 8)}`
  );
  normalizedMeta.id = instanceId;
  const { wrapper, placeholder } = createAdminDashboardItem(def, normalizedMeta, instanceId);
  return { wrapper, placeholder, meta: normalizedMeta, instanceId };
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

  normalizeDashboardEntries(layout, allWidgets).forEach(({ entry, index, def }) => {
    if (debug) console.debug('[Renderer] admin render dashboard widget placeholder', def.id);
    const { instanceId, meta } = createAdminInstanceMeta(entry, index, def);
    const { wrapper, placeholder } = createAdminDashboardItem(def, meta, instanceId);
    gridEl.appendChild(wrapper);
    if (typeof grid?.registerWidget === 'function') {
      grid.registerWidget(wrapper);
    }
    instanceMetaMap.set(instanceId, meta);
    pendingAdmin.push({ wrapper, def, meta, placeholder });
  });

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
