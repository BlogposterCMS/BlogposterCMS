import { createRuntimeCanvasItem, resolveRuntimeCanvasRect } from './runtimeCanvasItems.js';
import { renderRuntimeCanvasWidget } from './runtimeWidgetMounting.js';
import { waitForRuntimeWidgetShellPaint } from './runtimeWidgetHydration.js';
function findWidgetDefinition(allWidgets, widgetId) {
    return allWidgets.find(widget => widget.id === widgetId);
}
async function renderPendingGridWidgets(pending, grid, lane, widgetEmit, afterRender) {
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
export async function mountRuntimeGridWidgets({ gridEl, grid, layout, allWidgets, lane, widgetEmit, scaleX, scaleY, percentDivisor, includeLayoutMetadata = false, deferHydration = true, debug = false, afterRender }) {
    const pending = [];
    for (const item of layout) {
        const def = findWidgetDefinition(allWidgets, item.widgetId);
        if (!def)
            continue;
        if (debug)
            console.debug('[Renderer] render widget placeholder', def.id, item.id);
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
