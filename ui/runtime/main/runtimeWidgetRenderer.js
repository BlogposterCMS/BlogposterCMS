import { registerRuntimeWidgetEvents } from './runtimeWidgetEvents.js';
import { renderInlineWidgetCode } from './runtimeWidgetInlineCode.js';
import { createRuntimeWidgetShell } from './runtimeWidgetShell.js';
import { renderRuntimeWidgetModule } from './runtimeWidgetModuleRenderer.js';
export async function renderWidget(wrapper, def, code = null, lane = 'public') {
    const { root, container } = createRuntimeWidgetShell(wrapper, lane);
    await registerRuntimeWidgetEvents(def, lane);
    if (code) {
        renderInlineWidgetCode(wrapper, root, container, code);
        return;
    }
    await renderRuntimeWidgetModule(wrapper, container, def, lane);
}
