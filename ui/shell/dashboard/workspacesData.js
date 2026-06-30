import { emitRuntimeAdmin } from '../../shared/api-client/runtimeFacade.js';
export const ADMIN_LANE = 'admin';
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
    const response = await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'byLane', {
        lane: ADMIN_LANE
    });
    return toAdminPages(response);
}
export async function fetchAdminPageBySlug(emit, jwt, slug) {
    const meltdownEmit = requireEmitter(emit);
    const response = await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'getBySlug', {
        slug,
        lane: ADMIN_LANE
    });
    return toAdminPages(response)[0] ?? null;
}
export async function createWorkspacePage(emit, jwt, input) {
    const meltdownEmit = requireEmitter(emit);
    await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'create', {
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
    await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'create', {
        title: input.title,
        slug: `${input.workspace}/${input.slug}`,
        lane: ADMIN_LANE,
        status: 'published',
        parent_id: input.parentId,
        meta: { icon: input.icon }
    });
}
