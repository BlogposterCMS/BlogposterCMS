const RUNTIME_MANAGER_MODULE = {
    moduleName: 'runtimeManager',
    moduleType: 'core'
};
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('PLAINSPACE_COLLECTIONS_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
function objectParams(value = {}) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
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
function runtimeAdminPayload(jwt, resource, action, params = {}) {
    return {
        jwt,
        ...RUNTIME_MANAGER_MODULE,
        resource,
        action,
        params: objectParams(params)
    };
}
async function emitRuntimeAdmin(emit, jwt, resource, action, params = {}) {
    const result = await emit('cmsAdminApiRequest', runtimeAdminPayload(jwt, resource, action, params));
    return unwrapRuntimeFacadeData(result);
}
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export function normalizePageId(id) {
    if (id === null || id === undefined || id === '')
        return null;
    return String(id);
}
export function normalizeSlug(slug) {
    return String(slug || '').replace(/^\/+/, '').replace(/\/+$/, '');
}
export function readPageMeta(page) {
    if (!page.meta)
        return {};
    if (typeof page.meta === 'string') {
        try {
            const parsed = JSON.parse(page.meta);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        }
        catch {
            return {};
        }
    }
    return typeof page.meta === 'object' && !Array.isArray(page.meta) ? page.meta : {};
}
export function toPages(value) {
    if (Array.isArray(value)) {
        return value.filter((item) => Boolean(item) && typeof item === 'object');
    }
    if (value &&
        typeof value === 'object' &&
        Array.isArray(value.data)) {
        return (value.data || []).filter((item) => (Boolean(item) && typeof item === 'object'));
    }
    return [];
}
export function buildCollectionsPayload(jwt) {
    return runtimeAdminPayload(jwt, 'pages', 'byLane', { lane: 'public' });
}
function isVisiblePublicPage(page) {
    return (page.lane || 'public') === 'public' && page.status !== 'deleted';
}
export function getCollectionIndicator(page) {
    const meta = readPageMeta(page);
    const designId = meta.designId || page.design_id;
    if (typeof designId === 'string' || typeof designId === 'number') {
        return `Design: ${designId}`;
    }
    if (typeof meta.layoutTemplate === 'string' && meta.layoutTemplate.trim()) {
        return `Template: ${meta.layoutTemplate.trim()}`;
    }
    if (typeof meta.template === 'string' && meta.template.trim()) {
        return `Template: ${meta.template.trim()}`;
    }
    if (meta.layout && typeof meta.layout === 'object') {
        return 'Layout: configured';
    }
    return 'Default';
}
function toChildView(page) {
    const id = normalizePageId(page.id ?? page._id) || '';
    const slug = normalizeSlug(page.slug);
    return {
        page,
        id,
        title: String(page.title || 'Untitled page'),
        slug,
        status: String(page.status || 'draft'),
        editUrl: `/admin/pages/edit/${encodeURIComponent(id)}`,
        publicUrl: `/${slug}`
    };
}
export function deriveCollections(pages) {
    const publicPages = pages.filter(isVisiblePublicPage);
    const childrenByParent = new Map();
    publicPages.forEach(page => {
        const parentId = normalizePageId(page.parent_id);
        if (!parentId)
            return;
        childrenByParent.set(parentId, [...(childrenByParent.get(parentId) || []), page]);
    });
    return publicPages
        .filter(page => {
        const id = normalizePageId(page.id ?? page._id);
        if (!id)
            return false;
        const meta = readPageMeta(page);
        return Boolean(childrenByParent.get(id)?.length || meta.isCollection === true);
    })
        .map(page => {
        const id = normalizePageId(page.id ?? page._id) || '';
        const slug = normalizeSlug(page.slug);
        const children = (childrenByParent.get(id) || [])
            .map(toChildView)
            .sort((a, b) => a.title.localeCompare(b.title));
        return {
            page,
            id,
            title: String(page.title || 'Untitled collection'),
            slug,
            status: String(page.status || 'draft'),
            childCount: children.length,
            children,
            indicator: getCollectionIndicator(page),
            editUrl: `/admin/pages/edit/${encodeURIComponent(id)}`,
            publicUrl: `/${slug}`
        };
    })
        .sort((a, b) => a.title.localeCompare(b.title));
}
export async function fetchCollections(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const response = await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'byLane', { lane: 'public' });
    return deriveCollections(toPages(response));
}
