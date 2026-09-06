import { createRuntimeWidgetContext } from './runtimeWidgetContext.js';
import { loadWidgetModule, mountWidgetModule } from './widgetRuntimeGateway.js';
export async function renderRuntimeWidgetModule(wrapper, container, def, lane = 'public', instanceMetadata = {}, options = {}) {
    // Public/admin credentials stay in the runtime context, outside the shared renderer.
    await mountWidgetModule(container, def, loadWidgetModule, () => createRuntimeWidgetContext(wrapper, def, lane, instanceMetadata, { emit: options.emit }));
}
