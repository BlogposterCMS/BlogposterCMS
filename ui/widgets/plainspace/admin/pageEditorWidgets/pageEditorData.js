const PAGES_MODULE = {
    moduleName: 'pagesManager',
    moduleType: 'core'
};
const PLAINSPACE_MODULE = {
    moduleName: 'plainspace',
    moduleType: 'core'
};
// Keep page-manager and layout-template event payloads outside the DOM widget.
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('PLAINSPACE_PAGE_EDITOR_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
export function toPage(value) {
    return value && typeof value === 'object' ? value : null;
}
export function toTemplates(value) {
    const items = Array.isArray(value)
        ? value
        : value && typeof value === 'object' && Array.isArray(value.templates)
            ? value.templates
            : [];
    return items
        .map(item => typeof item === 'string' ? { name: item } : item)
        .filter((item) => Boolean(item) && typeof item === 'object');
}
export function visibleTemplates(value) {
    const templates = toTemplates(value).filter(template => !template.isGlobal);
    return templates.length ? templates : [{ name: 'default' }];
}
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export function asString(value) {
    return value == null ? '' : String(value);
}
export function buildPageUpdatePayload(jwt, page, values) {
    const title = values.title.trim();
    const seoDesc = values.seoDesc || '';
    const status = values.status || page.status;
    const slug = values.slug.trim() || page.slug;
    const publishAt = values.publishAt || '';
    const layoutName = values.layoutName || '';
    const seoImage = values.seoImage.trim() || '';
    return {
        jwt,
        ...PAGES_MODULE,
        pageId: page.id,
        slug,
        status,
        seo_image: seoImage,
        parent_id: page.parent_id,
        is_content: page.is_content,
        lane: page.lane,
        language: page.language,
        title,
        translations: [{
                language: page.language,
                title,
                html: page.html || '',
                css: page.css || '',
                metaDesc: seoDesc,
                seoTitle: page.seo_title || '',
                seoKeywords: page.seo_keywords || ''
            }],
        meta: {
            ...(page.meta || {}),
            publish_at: publishAt,
            layoutTemplate: layoutName
        }
    };
}
export function clearPageEditorCache(pageDataLoader, page) {
    pageDataLoader?.clear?.('getPageById', {
        ...PAGES_MODULE,
        pageId: page.id
    });
}
export async function fetchPageEditorTemplates(emit, jwt, lane) {
    const meltdownEmit = requireEmitter(emit);
    const res = await meltdownEmit('getLayoutTemplateNames', {
        jwt,
        ...PLAINSPACE_MODULE,
        lane
    });
    return visibleTemplates(res);
}
export async function savePageEditorPage(emit, jwt, page, values) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('updatePage', buildPageUpdatePayload(jwt, page, values));
}
