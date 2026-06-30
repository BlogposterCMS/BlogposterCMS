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
function unwrapRuntimeFacadeData(value) {
    if (value &&
        typeof value === 'object' &&
        'resource' in value &&
        'action' in value &&
        'data' in value) {
        return value.data;
    }
    return value;
}
async function emitPublicRuntime(ctx, resource, action, params = {}) {
    if (!ctx || typeof ctx.meltdownEmit !== 'function') {
        throw new Error('[DesignerPublicLoader:PUBLIC_RUNTIME_EMIT_MISSING] meltdownEmit is required.');
    }
    const result = await ctx.meltdownEmit('cmsPublicRuntimeRequest', {
        jwt: ctx.publicToken,
        moduleName: 'runtimeManager',
        moduleType: 'core',
        resource,
        action,
        params
    });
    return unwrapRuntimeFacadeData(result);
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
