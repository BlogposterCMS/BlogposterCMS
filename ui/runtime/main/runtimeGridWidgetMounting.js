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
        // These references are a render cache, not another layout owner. They let
        // the existing projection be reapplied when the canvas width settles.
        const reflowItem = wrapper;
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
export function reflowRuntimeGridWidgets({ gridEl, grid, scaleX, scaleY, percentDivisor }) {
    gridEl.querySelectorAll(':scope > .canvas-item').forEach(wrapper => {
        const item = wrapper.__runtimeLayoutItem;
        const def = wrapper.__runtimeWidgetDefinition;
        if (!item || !def)
            return;
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
        }
        else {
            grid?.update?.(wrapper, rect, { silent: true });
        }
    });
}
