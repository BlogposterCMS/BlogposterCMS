import { loadWidgetModule } from './widgetModuleLoader.js';
export async function renderWidgetModule(container, widgetDef, instanceId) {
    if (!widgetDef.codeUrl)
        return;
    const ctx = {
        id: instanceId,
        widgetId: widgetDef.id,
        metadata: widgetDef.metadata
    };
    if (window.ADMIN_TOKEN)
        ctx.jwt = window.ADMIN_TOKEN;
    try {
        const module = await loadWidgetModule(widgetDef.codeUrl);
        if (!module) {
            console.warn('[Widgets] blocked widget import path', widgetDef.id, widgetDef.codeUrl);
            return;
        }
        module.render?.(container, ctx);
    }
    catch (err) {
        console.error('[Widgets] widget import error', err);
    }
}
