export const ADMIN_LANE = 'admin';
// Keep workspace navigation page contracts here so rendering code stays UI-only.
const PAGES_MANAGER_MODULE = {
    moduleName: 'pagesManager',
    moduleType: 'core'
};
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('SHELL_WORKSPACES_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
export function toAdminPages(value) {
    if (Array.isArray(value)) {
        return value;
    }
    if (value && typeof value === 'object') {
        const container = value;
        const maybePages = container.pages ?? container.data;
        if (Array.isArray(maybePages)) {
            return maybePages;
        }
        if (maybePages && typeof maybePages === 'object' && 'slug' in maybePages) {
            return [maybePages];
        }
        if ('slug' in value) {
            return [value];
        }
    }
    return [];
}
export async function fetchAdminPagesByLane(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const response = await meltdownEmit('getPagesByLane', {
        jwt,
        ...PAGES_MANAGER_MODULE,
        lane: ADMIN_LANE
    });
    return toAdminPages(response);
}
export async function fetchAdminPageBySlug(emit, jwt, slug) {
    const meltdownEmit = requireEmitter(emit);
    const response = await meltdownEmit('getPageBySlug', {
        jwt,
        ...PAGES_MANAGER_MODULE,
        slug,
        lane: ADMIN_LANE
    });
    return toAdminPages(response)[0] ?? null;
}
export async function createWorkspacePage(emit, jwt, input) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('createPage', {
        jwt,
        ...PAGES_MANAGER_MODULE,
        title: input.title,
        slug: input.slug,
        lane: ADMIN_LANE,
        status: 'published',
        parent_id: null,
        meta: { icon: input.icon, workspace: input.slug }
    });
}
export async function createWorkspaceSubpage(emit, jwt, input) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('createPage', {
        jwt,
        ...PAGES_MANAGER_MODULE,
        title: input.title,
        slug: `${input.workspace}/${input.slug}`,
        lane: ADMIN_LANE,
        status: 'published',
        parent_id: input.parentId,
        meta: { icon: input.icon }
    });
}
