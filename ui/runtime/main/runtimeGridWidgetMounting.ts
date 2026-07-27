import {
  applyRuntimeLayoutMetadata,
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

type RuntimeReflowCanvasItem = HTMLElement & {
  __runtimeLayoutItem?: RuntimeGridLayoutItem;
  __runtimeWidgetDefinition?: RuntimeWidgetDefinition;
};

export type RuntimeGridReflowOptions = {
  gridEl: HTMLElement;
  grid: RendererGrid | null | undefined;
  scaleX: number;
  scaleY: number;
  percentDivisor?: number;
};

export type RuntimeGridStructuralItem = {
  element: HTMLElement;
  item: RuntimeGridLayoutItem;
};

export type RuntimeGridStructuralMountOptions = {
  grid: RendererGrid | null | undefined;
  items: RuntimeGridStructuralItem[];
  scaleX: number;
  scaleY: number;
  percentDivisor?: number;
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
    // These references are a render cache, not another layout owner. They let
    // the existing projection be reapplied when the canvas width settles.
    const reflowItem = wrapper as RuntimeReflowCanvasItem;
    reflowItem.__runtimeLayoutItem = item;
    reflowItem.__runtimeWidgetDefinition = def;

    gridEl.appendChild(wrapper);
    grid?.makeWidget?.(wrapper);
    pending.push({ wrapper, item, def, placeholder });
  }

  if (pending.length && deferHydration) {
    await waitForRuntimeWidgetShellPaint();
  }

  await renderPendingGridWidgets(pending, grid, lane, widgetEmit, afterRender);
}

export function mountRuntimeGridStructuralItems({
  grid,
  items,
  scaleX,
  scaleY,
  percentDivisor
}: RuntimeGridStructuralMountOptions): void {
  items.forEach(({ element, item }) => {
    const rect = resolveRuntimeCanvasRect(item, {
      scaleX,
      scaleY,
      percentDivisor
    });
    const structuralElement = element as RuntimeReflowCanvasItem;
    structuralElement.classList.add('canvas-item', 'runtime-layout-grid-item');
    structuralElement.dataset.x = String(rect.x);
    structuralElement.dataset.y = String(rect.y);
    structuralElement.setAttribute('gs-w', String(rect.w));
    structuralElement.setAttribute('gs-h', String(rect.h));
    structuralElement.setAttribute('gs-min-w', structuralElement.getAttribute('gs-min-w') || '120');
    structuralElement.setAttribute('gs-min-h', structuralElement.getAttribute('gs-min-h') || '80');
    // Keep the structural node on the same responsive projection path as
    // regular widgets without pretending it has a widget definition.
    structuralElement.__runtimeLayoutItem = item;
    applyRuntimeLayoutMetadata(structuralElement, item);
    grid?.makeWidget?.(structuralElement, { silent: true });
  });
}

export function reflowRuntimeGridWidgets({
  gridEl,
  grid,
  scaleX,
  scaleY,
  percentDivisor
}: RuntimeGridReflowOptions): void {
  gridEl.querySelectorAll<RuntimeReflowCanvasItem>(':scope > .canvas-item').forEach(wrapper => {
    const item = wrapper.__runtimeLayoutItem;
    const def = wrapper.__runtimeWidgetDefinition;
    // Structural Container items share the same grid projection but do not
    // have a widget definition. Their LayoutTree placement is still enough to
    // reflow them through the canonical responsive geometry contract.
    if (!item) return;
    const rect = resolveRuntimeCanvasRect(item, {
      scaleX,
      scaleY,
      percentDivisor,
      def
    });
    wrapper.dataset.x = String(rect.x);
    wrapper.dataset.y = String(rect.y);
    wrapper.setAttribute('gs-w', String(rect.w));
    wrapper.setAttribute('gs-h', String(rect.h));
    if (typeof grid?._applyPosition === 'function') {
      // The responsive contract already produced the final pixel rectangle.
      // Reapplying it without percentage recalculation preserves a deliberate,
      // symmetric overflow when an authored element is wider than the viewport.
      grid._applyPosition(wrapper, { x: false, y: false, w: false, h: false });
    } else {
      grid?.update?.(wrapper, rect, { silent: true });
    }
  });
}
