import * as LR from './envelope/loaderRegistry.js';
import { getPublicLoaderPaths, isPublicLoaderSource } from './publicLoaderPaths.js';
export async function tryImportPublicLoader(src) {
    const paths = getPublicLoaderPaths(src);
    if (!paths.length)
        return false;
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
