import { emitRuntimeAdmin } from '../../shared/api-client/runtimeFacade.js';
const PROTECTED_ROOT_WORKSPACES = new Set(['home', 'settings']);
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('SHELL_CONTENT_HEADER_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export function toAdminPage(value) {
    if (Array.isArray(value)) {
        return value[0] && typeof value[0] === 'object' ? value[0] : null;
    }
    return value && typeof value === 'object' ? value : null;
}
export function normalizeAdminBase(adminBase) {
    return (adminBase || '/admin/').replace(/\/+/g, '/');
}
export function adminSlugFromPath(pathname, adminBase) {
    const normalizedBase = normalizeAdminBase(adminBase);
    let rel = pathname;
    if (rel.startsWith(normalizedBase))
        rel = rel.slice(normalizedBase.length);
    return rel.replace(/^\/|\/$/g, '');
}
export function adminBaseHref(adminBase) {
    const normalizedBase = normalizeAdminBase(adminBase);
    return normalizedBase.endsWith('/') ? normalizedBase.slice(0, -1) : normalizedBase;
}
export function isProtectedAdminWorkspace(page) {
    const slug = String(page.slug || '');
    const baseSlug = slug.split('/')[0] || '';
    return PROTECTED_ROOT_WORKSPACES.has(baseSlug) && baseSlug === slug;
}
export async function fetchAdminPageBySlug(emit, jwt, slug) {
    const meltdownEmit = requireEmitter(emit);
    const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'getBySlug', {
        slug,
        lane: 'admin'
    });
    return toAdminPage(res);
}
export async function deleteAdminPage(emit, jwt, pageId) {
    const meltdownEmit = requireEmitter(emit);
    await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'delete', {
        pageId
    });
}
