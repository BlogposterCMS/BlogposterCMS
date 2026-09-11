import * as LR from './envelope/loaderRegistry.js';
import { getPublicLoaderPaths, isPublicLoaderSource } from './publicLoaderPaths.js';
// Core loaders are release-owned code, so Webpack can package their existing
// module contracts into lazy chunks. Community loaders remain runtime-discovered.
const CORE_PUBLIC_LOADER_IMPORTERS = {
    designerManager: () => import('../../mother/modules/designerManager/publicLoader.js'),
    pagesManager: () => import('../../mother/modules/pagesManager/publicLoader.js'),
    widgetManager: () => import('../../mother/modules/widgetManager/publicLoader.js')
};
const DESIGNER_LIVE_PREVIEW_RUNTIME_PATH = '/ui/designer/app/renderer/livePreviewRuntime.js';
export async function importDesignerLivePreviewRuntime() {
    await import(/* webpackIgnore: true */ DESIGNER_LIVE_PREVIEW_RUNTIME_PATH);
}
export async function tryImportPublicLoader(src) {
    const paths = getPublicLoaderPaths(src);
    if (!paths.length)
        return false;
    const coreImporter = Object.hasOwn(CORE_PUBLIC_LOADER_IMPORTERS, src)
        ? CORE_PUBLIC_LOADER_IMPORTERS[src]
        : undefined;
    if (coreImporter) {
        try {
            const mod = await coreImporter();
            if (typeof mod.registerLoaders === 'function')
                mod.registerLoaders(LR.register);
            return true;
        }
        catch {
            console.warn(`No publicLoader found for "${src}" in ${paths.join(' or ')}`);
            return false;
        }
    }
    for (const path of paths) {
        try {
            const mod = await import(/* webpackIgnore: true */ path);
            if (typeof mod.registerLoaders === 'function')
                mod.registerLoaders(LR.register);
            return true;
        }
        catch {
            // Try the next allowed publicLoader path for this source.
        }
    }
    console.warn(`No publicLoader found for "${src}" in ${paths.join(' or ')}`);
    return false;
}
export async function loadPublicRuntimeLoaders(envelope) {
    const modules = [...new Set((envelope?.attachments || [])
            .map(attachment => attachment.source)
            .filter(isPublicLoaderSource))];
    await Promise.all(modules.map(tryImportPublicLoader));
}
