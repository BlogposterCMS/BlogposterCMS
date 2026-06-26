import {
  createRuntimeCanvasItem,
  resolveRuntimeCanvasRect,
  type RuntimeCanvasItemMeta
} from './runtimeCanvasItems.js';
import type { RendererGrid } from './runtimeGridMetrics.js';
import type { RuntimeWidgetDefinition } from './runtimeWidgetRenderer.js';
import {
  renderRuntimeCanvasWidget,
  type RuntimeWidgetMountHook
} from './runtimeWidgetMounting.js';
import { waitForRuntimeWidgetShellPaint } from './runtimeWidgetHydration.js';
import type { RuntimeEmitter as RuntimeWidgetEmitter } from './runtimeWidgetInstances.js';

export type RuntimeGridLayoutItem = RuntimeCanvasItemMeta;

export type RuntimeGridWidgetMountOptions = {
  gridEl: HTMLElement;
  grid: RendererGrid | null | undefined;
  layout: RuntimeGridLayoutItem[];
  allWidgets: RuntimeWidgetDefinition[];
  lane: string;
  widgetEmit: RuntimeWidgetEmitter;
  scaleX: number;
  scaleY: number;
  percentDivisor?: number;
  includeLayoutMetadata?: boolean;
  deferHydration?: boolean;
  debug?: boolean;
  afterRender?: RuntimeWidgetMountHook;
};

type RuntimeGridPendingItem = {
  wrapper: HTMLElement;
  item: RuntimeGridLayoutItem;
  def: RuntimeWidgetDefinition;
  placeholder: HTMLElement;
};

function findWidgetDefinition(
  allWidgets: RuntimeWidgetDefinition[],
  widgetId: unknown
): RuntimeWidgetDefinition | undefined {
  return allWidgets.find(widget => widget.id === widgetId);
}

async function renderPendingGridWidgets(
  pending: RuntimeGridPendingItem[],
  grid: RendererGrid | null | undefined,
  lane: string,
  widgetEmit: RuntimeWidgetEmitter,
  afterRender?: RuntimeWidgetMountHook
): Promise<void> {
  for (const { wrapper, item, def, placeholder } of pending) {
    await renderRuntimeCanvasWidget({
      wrapper,
      placeholder,
      item,
      def,
      grid,
      emit: widgetEmit,
      lane,
      afterRender
    });
  }
}

export async function mountRuntimeGridWidgets({
  gridEl,
  grid,
  layout,
  allWidgets,
  lane,
  widgetEmit,
  scaleX,
  scaleY,
  percentDivisor,
  includeLayoutMetadata = false,
  deferHydration = true,
  debug = false,
  afterRender
}: RuntimeGridWidgetMountOptions): Promise<void> {
  const pending: RuntimeGridPendingItem[] = [];

  for (const item of layout) {
    const def = findWidgetDefinition(allWidgets, item.widgetId);
    if (!def) continue;
    if (debug) console.debug('[Renderer] render widget placeholder', def.id, item.id);
    const rect = resolveRuntimeCanvasRect(item, { scaleX, scaleY, percentDivisor, def });
    const { wrapper, placeholder } = createRuntimeCanvasItem({
      def,
      item,
      ...rect,
      instanceId: item.id,
      includeLayoutMetadata
    });

    gridEl.appendChild(wrapper);
    grid?.makeWidget?.(wrapper);
    pending.push({ wrapper, item, def, placeholder });
  }

  if (pending.length && deferHydration) {
    await waitForRuntimeWidgetShellPaint();
  }

  await renderPendingGridWidgets(pending, grid, lane, widgetEmit, afterRender);
}
