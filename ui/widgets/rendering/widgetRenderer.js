import { renderWidgetInlineCode } from './widgetInlineCode.js';
import { registerWidgetEvents } from './widgetEvents.js';
import { renderWidgetModule } from './widgetModuleRenderer.js';
import { createWidgetRenderShell } from './widgetShell.js';
export async function renderWidget(wrapper, widgetDef, codeMap = null, customData = null, context = 'Widgets') {
    const instanceId = wrapper.dataset.instanceId;
    const data = customData || (instanceId && codeMap ? codeMap[instanceId] : null);
    const content = wrapper.querySelector('.canvas-item-content');
    if (!content) {
        console.error('[renderWidget] .canvas-item-content not found for', widgetDef.id);
        return;
    }
    const container = createWidgetRenderShell(content);
    await registerWidgetEvents(widgetDef);
    if (data) {
        renderWidgetInlineCode(wrapper, content, container, data, context);
        return;
    }
    await renderWidgetModule(container, widgetDef, instanceId);
}
