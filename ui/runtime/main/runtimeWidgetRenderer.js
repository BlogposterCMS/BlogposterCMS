import { registerRuntimeWidgetEvents } from './runtimeWidgetEvents.js';
import { renderInlineWidgetCode } from './runtimeWidgetInlineCode.js';
import { parseMetadata } from './sceneRuntime.js';
import { createRuntimeWidgetShell } from './runtimeWidgetShell.js';
import { renderRuntimeWidgetModule } from './runtimeWidgetModuleRenderer.js';
function hasInlineWidgetCode(code) {
    return Boolean(code && (typeof code.html === 'string' && code.html.trim() ||
        typeof code.css === 'string' && code.css.trim() ||
        typeof code.js === 'string' && code.js.trim()));
}
function instanceMetadataFromCode(code) {
    if (!code)
        return {};
    return {
        ...parseMetadata(code.metadata),
        ...parseMetadata(code.meta)
    };
}
export async function renderWidget(wrapper, def, code = null, lane = 'public', options = {}) {
    const { root, container } = createRuntimeWidgetShell(wrapper, lane);
    const instanceMetadata = instanceMetadataFromCode(code);
    await registerRuntimeWidgetEvents(def, lane);
    if (hasInlineWidgetCode(code)) {
        renderInlineWidgetCode(wrapper, root, container, code);
        return;
    }
    await renderRuntimeWidgetModule(wrapper, container, def, lane, instanceMetadata, {
        emit: options.emit
    });
}
