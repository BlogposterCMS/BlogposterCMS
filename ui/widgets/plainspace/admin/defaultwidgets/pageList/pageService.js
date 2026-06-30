const runtimeManagerOptions = { moduleName: 'runtimeManager', moduleType: 'core' };
function getRuntime() {
    const runtimeWindow = typeof window === 'undefined' ? null : window;
    const meltdownEmit = runtimeWindow?.meltdownEmit;
    if (typeof meltdownEmit !== 'function') {
        throw new Error('meltdownEmit is not available');
    }
    return {
        meltdownEmit,
        jwt: runtimeWindow?.ADMIN_TOKEN
    };
}
function toArray(value) {
    if (Array.isArray(value))
        return value;
    if (value && typeof value === 'object' && Array.isArray(value.data)) {
        return value.data;
    }
    return [];
}
function unwrapRuntimeResult(value) {
    if (value &&
        typeof value === 'object' &&
        'resource' in value &&
        'action' in value &&
        'data' in value) {
        return value.data;
    }
    return value;
}
async function requestPageAction(action, params = {}) {
    const { meltdownEmit, jwt } = getRuntime();
    const result = await meltdownEmit('cmsAdminApiRequest', {
        ...runtimeManagerOptions,
        jwt,
        resource: 'pages',
        action,
        params
    });
    return unwrapRuntimeResult(result);
}
export const sanitizeSlug = (raw) => (raw == null ? '' : String(raw))
    .trim()
    .toLowerCase()
    .replace(/^\/+/g, '')
    .replace(/[^a-z0-9/-]/gi, '')
    .replace(/\/+/g, '/')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .replace(/\/+$/, '');
export const pageService = {
    async getPagesByLane(lane = 'public') {
        const safeLane = typeof lane === 'string' && lane.trim() ? lane.trim() : 'public';
        const res = await requestPageAction('byLane', { lane: safeLane });
        return toArray(res);
    },
    async getAll() {
        return this.getPagesByLane('public');
    },
    async create({ title, slug, status = 'published', meta }) {
        return requestPageAction('create', {
            title,
            slug,
            lane: 'public',
            status,
            ...(meta ? { meta } : {})
        });
    },
    async update(page, patch) {
        return requestPageAction('update', {
            pageId: page.id,
            slug: page.slug,
            status: page.status,
            seo_Image: page.seo_image,
            parent_id: page.parent_id,
            is_content: page.is_content,
            lane: page.lane,
            language: page.language,
            title: page.title,
            meta: page.meta,
            ...patch
        });
    },
    updateSlug(page, slug) {
        return this.update(page, { slug });
    },
    updateTitle(page, title) {
        return this.update(page, { title });
    },
    updateStatus(page, status) {
        return this.update(page, { status });
    },
    updateParent(page, parent_id) {
        return this.update(page, { parent_id });
    },
    async setAsStart(id) {
        return requestPageAction('setStart', { pageId: id });
    },
    async delete(id) {
        return requestPageAction('delete', { pageId: id });
    }
};
