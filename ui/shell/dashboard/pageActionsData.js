import { emitRuntimeAdmin } from '../../shared/api-client/runtimeFacade.js';
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('SHELL_PAGE_ACTIONS_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export async function createPublicPage(emit, jwt, title, slug) {
    const meltdownEmit = requireEmitter(emit);
    const result = await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'create', {
        title,
        slug,
        lane: 'public',
        status: 'published'
    });
    return result && typeof result === 'object'
        ? (result.pageId ?? null)
        : null;
}
export async function savePublicLayoutTemplate(emit, jwt, layoutName) {
    const meltdownEmit = requireEmitter(emit);
    await emitRuntimeAdmin(meltdownEmit, jwt, 'plainSpace', 'saveLayoutTemplate', {
        name: layoutName.trim(),
        lane: 'public',
        viewport: 'desktop',
        layout: [],
        previewPath: ''
    });
}
