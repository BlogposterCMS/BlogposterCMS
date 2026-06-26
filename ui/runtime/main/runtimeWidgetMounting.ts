import { mergeSceneMetaIntoCode } from './sceneRuntime.js';
import {
  mountRuntimeCanvasContent,
  type RuntimeCanvasItemMeta,
  type RuntimeCanvasWidgetDefinition
} from './runtimeCanvasItems.js';
import type { RendererGrid } from './runtimeGridMetrics.js';
import { renderWidget } from './runtimeWidgetRenderer.js';
import { markRuntimeWidgetHydrationState } from './runtimeWidgetHydration.js';
import {
  applyDefaultWidgetInstanceOptions,
  type RuntimeEmitter
} from './runtimeWidgetInstances.js';

export type RuntimeWidgetMountHook = (
  wrapper: HTMLElement,
  grid: RendererGrid | null | undefined
) => Promise<void> | void;

export type RuntimeWidgetMountOptions = {
  wrapper: HTMLElement;
  placeholder?: HTMLElement | null;
  item: RuntimeCanvasItemMeta;
  def: RuntimeCanvasWidgetDefinition;
  grid: RendererGrid | null | undefined;
  emit: RuntimeEmitter;
  lane: string;
  afterRender?: RuntimeWidgetMountHook;
};

export async function renderRuntimeCanvasWidget({
  wrapper,
  placeholder,
  item,
  def,
  grid,
  emit,
  lane,
  afterRender
}: RuntimeWidgetMountOptions): Promise<HTMLElement> {
  markRuntimeWidgetHydrationState(wrapper, 'hydrating');
  const content = mountRuntimeCanvasContent(wrapper, placeholder);

  try {
    await applyDefaultWidgetInstanceOptions(wrapper, def, grid, emit, lane);
    await renderWidget(content, def, mergeSceneMetaIntoCode(item.code || null, item), lane);
    if (afterRender) await afterRender(wrapper, grid);
    markRuntimeWidgetHydrationState(wrapper, 'ready');
    return content;
  } catch (err) {
    const detail = err instanceof Error && err.message
      ? err.message
      : 'WIDGET_HYDRATION_FAILED';
    markRuntimeWidgetHydrationState(wrapper, 'failed', detail);
    throw err;
  }
}
