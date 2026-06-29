import { mergeSceneMetaIntoCode } from './sceneRuntime.js';
import { mountRuntimeCanvasContent } from './runtimeCanvasItems.js';
import { renderWidget } from './runtimeWidgetRenderer.js';
import { markRuntimeWidgetHydrationState } from './runtimeWidgetHydration.js';
import { applyDefaultWidgetInstanceOptions } from './runtimeWidgetInstances.js';
export async function renderRuntimeCanvasWidget({ wrapper, placeholder, item, def, grid, emit, lane, afterRender }) {
    markRuntimeWidgetHydrationState(wrapper, 'hydrating');
    const content = mountRuntimeCanvasContent(wrapper, placeholder);
    try {
        await applyDefaultWidgetInstanceOptions(wrapper, def, grid, emit, lane);
        await renderWidget(content, def, mergeSceneMetaIntoCode(item.code || null, item), lane, { emit });
        if (afterRender)
            await afterRender(wrapper, grid);
        markRuntimeWidgetHydrationState(wrapper, 'ready');
        return content;
    }
    catch (err) {
        const detail = err instanceof Error && err.message
            ? err.message
            : 'WIDGET_HYDRATION_FAILED';
        markRuntimeWidgetHydrationState(wrapper, 'failed', detail);
        throw err;
    }
}
