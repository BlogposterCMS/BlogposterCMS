import { normalizeEffects } from './sceneRuntime.js';
export function createRuntimeWidgetContext(wrapper, def, lane, instanceMetadata = {}) {
    const host = (wrapper.closest('.canvas-item') || wrapper);
    const ctx = {
        id: host.dataset.instanceId,
        widgetId: def.id,
        metadata: def.metadata,
        instanceMetadata,
        scene: {
            behavior: host.dataset.behavior || '',
            sceneId: host.dataset.sceneId || '',
            sceneTitle: host.dataset.sceneTitle || '',
            sceneBackground: host.dataset.sceneBackground || '',
            scrollStart: host.dataset.scrollStart || '',
            scrollEnd: host.dataset.scrollEnd || '',
            effects: normalizeEffects(host.dataset.effects),
        }
    };
    if (lane === 'admin' && window.ADMIN_TOKEN) {
        ctx.jwt = window.ADMIN_TOKEN;
    }
    return ctx;
}
