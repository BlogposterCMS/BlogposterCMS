export const DEFAULT_PAGE_DATA_FIELDS = [
    'id',
    'slug',
    'status',
    'title',
    'seo_image',
    'translations',
    'trans_title',
    'trans_lang',
    'html',
    'css',
    'meta_desc',
    'seo_title',
    'seo_keywords',
    'meta',
    'language',
    'lane',
    'parent_id',
    'parentSlug',
    'is_content'
];
export function unwrapMeltdownResult(result) {
    if (result && typeof result === 'object' && 'data' in result) {
        const data = result.data;
        return data ?? result;
    }
    return result ?? null;
}
export function sanitizePageData(data, fields) {
    if (!fields)
        return data && typeof data === 'object' ? data : null;
    if (!data || typeof data !== 'object')
        return null;
    const out = {};
    const record = data;
    for (const field of fields) {
        if (Object.hasOwn(record, field))
            out[field] = record[field];
    }
    return out;
}
export function pageDataCacheKey(eventName, payload = {}) {
    return `${eventName}:${JSON.stringify(payload)}`;
}
export function buildInitialPageDataRequest(pageId) {
    return {
        eventName: 'cmsAdminApiRequest',
        payload: {
            moduleName: 'runtimeManager',
            moduleType: 'core',
            resource: 'pages',
            action: 'get',
            params: { pageId }
        },
        fields: DEFAULT_PAGE_DATA_FIELDS
    };
}
