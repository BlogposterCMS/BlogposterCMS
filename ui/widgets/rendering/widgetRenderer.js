import { renderWidgetInlineCode } from './widgetInlineCode.js';
import { registerWidgetEvents } from './widgetEvents.js';
import { renderWidgetModule } from './widgetModuleRenderer.js';
import { createWidgetRenderShell } from './widgetShell.js';
function hasInlineWidgetCode(data) {
    return Boolean(data && (typeof data.html === 'string' && data.html.trim() ||
        typeof data.css === 'string' && data.css.trim() ||
        typeof data.js === 'string' && data.js.trim()));
}
function parseMetadata(value) {
    if (!value)
        return {};
    if (typeof value === 'object' && !Array.isArray(value))
        return value;
    if (typeof value !== 'string')
        return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed
            : {};
    }
    catch {
        return {};
    }
}
function instanceMetadataFromCode(data) {
    if (!data)
        return {};
    return {
        ...parseMetadata(data.metadata),
        ...parseMetadata(data.meta)
    };
}
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
    if (hasInlineWidgetCode(data)) {
        renderWidgetInlineCode(wrapper, content, container, data, context);
        return;
    }
    await renderWidgetModule(container, widgetDef, instanceId, instanceMetadataFromCode(data));
}
