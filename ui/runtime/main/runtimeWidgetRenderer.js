import { renderInlineWidgetCode } from './runtimeWidgetInlineCode.js';
import { hasInlineWidgetCode, instanceMetadataFromCode } from './widgetRuntimeGateway.js';
import { createRuntimeWidgetShell } from './runtimeWidgetShell.js';
import { renderRuntimeWidgetModule } from './runtimeWidgetModuleRenderer.js';
export async function renderWidget(wrapper, def, code = null, lane = 'public', options = {}) {
    const { root, container } = createRuntimeWidgetShell(wrapper, lane);
    const instanceMetadata = instanceMetadataFromCode(code);
    // Widgets render directly; existing runtime facades authorize their reads.
    if (hasInlineWidgetCode(code)) {
        renderInlineWidgetCode(wrapper, root, container, code);
        return;
    }
    await renderRuntimeWidgetModule(wrapper, container, def, lane, instanceMetadata, {
        emit: options.emit
    });
}
