import { renderWidgetInlineCode, hasInlineWidgetCode, instanceMetadataFromCode } from './widgetInlineCode.js';
import { renderWidgetModule } from './widgetModuleRenderer.js';
import { createWidgetRenderShell } from './widgetShell.js';
export async function renderWidget(wrapper, widgetDef, codeMap = null, customData = null, context = 'Widgets', options = {}) {
    const instanceId = wrapper.dataset.instanceId;
    const data = customData || (instanceId && codeMap ? codeMap[instanceId] : null);
    const content = wrapper.querySelector('.canvas-item-content');
    if (!content) {
        console.error('[renderWidget] .canvas-item-content not found for', widgetDef.id);
        return;
    }
    const container = createWidgetRenderShell(content);
    // API metadata documents dependencies. The facade authorizes each request;
    // rendering does not register browser-supplied actions or grant permissions.
    if (hasInlineWidgetCode(data)) {
        renderWidgetInlineCode(wrapper, content, container, data, context, options.onInlineRendered);
        return;
    }
    await renderWidgetModule(container, widgetDef, instanceId, instanceMetadataFromCode(data), options.scene);
}
