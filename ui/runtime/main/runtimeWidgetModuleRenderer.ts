import { createRuntimeWidgetContext } from './runtimeWidgetContext.js';
import { loadWidgetModule, mountWidgetModule } from './widgetRuntimeGateway.js';
import type { RuntimeWidgetDefinition } from './runtimeWidgetTypes.js';

export async function renderRuntimeWidgetModule(
  wrapper: HTMLElement,
  container: HTMLElement,
  def: RuntimeWidgetDefinition,
  lane = 'public',
  instanceMetadata: Record<string, any> = {},
  options: { emit?: (...args: any[]) => Promise<any> } = {}
): Promise<void> {
  // Public/admin credentials stay in the runtime context, outside the shared renderer.
  await mountWidgetModule(container, def, loadWidgetModule, () =>
    createRuntimeWidgetContext(wrapper, def, lane, instanceMetadata, { emit: options.emit })
  );
}
