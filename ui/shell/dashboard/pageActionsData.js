// Keep dashboard event contracts here so DOM handlers stay focused on UI flow.
const PAGES_MANAGER_MODULE = {
    moduleName: 'pagesManager',
    moduleType: 'core'
};
const PLAINSPACE_MODULE = {
    moduleName: 'plainspace',
    moduleType: 'core'
};
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
    const result = await meltdownEmit('createPage', {
        jwt,
        ...PAGES_MANAGER_MODULE,
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
    await meltdownEmit('saveLayoutTemplate', {
        jwt,
        ...PLAINSPACE_MODULE,
        name: layoutName.trim(),
        lane: 'public',
        viewport: 'desktop',
        layout: [],
        previewPath: ''
    });
}
