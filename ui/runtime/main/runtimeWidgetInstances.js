import { applyWidgetOptions } from './widgetRuntimeGateway.js';
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
    try {
        const res = await emit('getWidgetInstance', {
            moduleName: 'plainspace',
            moduleType: 'core',
            instanceId: `default.${def.id}`,
            ...(lane === 'admin' ? { jwt: window.ADMIN_TOKEN } : {})
        });
        const opts = parseWidgetOptions(res?.content) ?? undefined;
        applyWidgetOptions(wrapper, opts, grid);
    }
    catch { }
}
