// Unbundled browser loaders use the public ESM facade, not server CommonJS.
import { emitRuntimePublic } from '/ui/shared/api-client/runtimeFacade.js';
function preloadLink(href, rel = 'stylesheet') {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    document.head.appendChild(link);
    return link;
}
function fallbackLayout(layoutRef) {
    return {
        grid: { columns: 12, cellHeight: 8 },
        items: [],
        layoutRef
    };
}
async function emitPublicRuntime(ctx, resource, action, params = {}) {
    if (!ctx || typeof ctx.meltdownEmit !== 'function') {
        throw new Error('[DesignerPublicLoader:PUBLIC_RUNTIME_EMIT_MISSING] meltdownEmit is required.');
    }
    return emitRuntimePublic(ctx.meltdownEmit, ctx.publicToken, resource, action, params);
}
async function loadDesign(descriptor = {}, ctx) {
    const { css = [], layoutRef } = descriptor;
    css.forEach(href => preloadLink(href, 'stylesheet'));
    const layout = await emitPublicRuntime(ctx, 'designer', 'getLayout', {
        layoutRef
    }).catch(error => {
        console.warn('[DesignerPublicLoader:LAYOUT_LOAD_FAILED] Falling back to an empty layout.', error);
        return null;
    });
    const activeLayout = layout || fallbackLayout(layoutRef);
    if (ctx && typeof ctx === 'object') {
        ctx.activeLayout = activeLayout;
        ctx.activeLayoutRef = layoutRef;
    }
    return activeLayout;
}
export function registerLoaders(register) {
    register('design', loadDesign);
}
export { loadDesign };
