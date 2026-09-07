import { runtimePublicPayload, unwrapRuntimeFacadeData } from '../../../../shared/api-client/runtimeFacade.js';
import { normalizeLinkUrl } from './publicWidgetHelpers.js';
/** Follow actual page relationships; URL segments need not match the CMS parent tree. */
export async function loadBreadcrumbPages(path, ctx) {
    const emit = ctx.emit || (window.PUBLIC_TOKEN ? window.meltdownEmit : undefined);
    if (!emit)
        return null; // Studio without a public context keeps the explicit path preview.
    const get = async (action, params) => {
        const response = unwrapRuntimeFacadeData(await emit('cmsPublicRuntimeRequest', runtimePublicPayload(window.PUBLIC_TOKEN, 'pages', action, { ...params, lane: 'public' })));
        const page = response?.page || response;
        // Never substitute the Studio/admin principal or show unpublished ancestors.
        return page?.id != null && page.status === 'published' && (!page.lane || page.lane === 'public') ? page : null;
    };
    let page = await get(path === '/' ? 'start' : 'getBySlug', { slug: path.replace(/^\/+|\/+$/gu, '') });
    const trail = [];
    const visited = new Set();
    while (page) {
        const id = String(page.id);
        if (visited.has(id) || visited.size >= 16)
            throw new Error('BP_WIDGET_BREADCRUMB_HIERARCHY_CYCLE');
        visited.add(id);
        const href = normalizeLinkUrl(`/${String(page.slug || '').replace(/^\//u, '')}`);
        if (page.title && href)
            trail.unshift({ id, label: page.title, href, children: [] });
        const parentId = page.parent_id ?? page.parentId;
        page = parentId ? await get('get', { pageId: parentId }) : null;
    }
    return trail;
}
