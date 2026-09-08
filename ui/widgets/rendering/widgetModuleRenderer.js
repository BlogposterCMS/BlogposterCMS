import { mountWidgetModule } from './widgetModuleMount.js';
import { loadWidgetModule } from './widgetModuleLoader.js';
export async function renderWidgetModule(container, widgetDef, instanceId, instanceMetadata = {}, scene) {
    const ctx = {
        id: instanceId,
        widgetId: widgetDef.id,
        ...(widgetDef.codeUrl?.startsWith('/widgets/') ? { preview: true } : {}),
        metadata: widgetDef.metadata,
        instanceMetadata
    };
    if (window.ADMIN_TOKEN)
        ctx.jwt = window.ADMIN_TOKEN;
    if (scene)
        ctx.scene = scene;
    await mountWidgetModule(container, widgetDef, loadWidgetModule, () => ctx);
}
