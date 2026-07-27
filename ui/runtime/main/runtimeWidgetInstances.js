import { applyWidgetOptions } from './widgetRuntimeGateway.js';
import { runtimePublicPayload, unwrapRuntimeFacadeData } from '../../shared/api-client/runtimeFacade.js';
function parseWidgetOptions(content) {
    if (!content)
        return null;
    if (typeof content === 'object')
        return content;
    if (typeof content !== 'string')
        return null;
    return JSON.parse(content);
}
export async function applyDefaultWidgetInstanceOptions(wrapper, def, grid, emit, lane = 'public') {
    if (lane === 'admin') {
        return;
    }
    try {
        // Public pages and the sandboxed Live Preview share the audited Runtime
        // Manager facade. Direct PlainSpace events cannot cross the AppLoader
        // bridge and would make widget defaults disappear only in the preview.
        const response = await emit('cmsPublicRuntimeRequest', runtimePublicPayload(window.PUBLIC_TOKEN, 'plainSpace', 'widgetInstance', {
            instanceId: `default.${def.id}`
        }));
        const res = unwrapRuntimeFacadeData(response);
        const parsedOptions = parseWidgetOptions(res?.content);
        applyWidgetOptions(wrapper, parsedOptions ?? undefined, grid);
    }
    catch { }
}
