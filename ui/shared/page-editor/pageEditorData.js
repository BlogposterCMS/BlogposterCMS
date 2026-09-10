import { emitRuntimeAdmin, runtimeAdminPayload } from '../api-client/runtimeFacade.js';
import { normalizeContentTags } from '../content/contentTags.js';
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
    const seoImage = values.seoImage.trim() || '';
    return runtimeAdminPayload(jwt, 'pages', 'update', {
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
                seoTitle: values.seoTitle?.trim() ?? page.seo_title ?? '',
                seoKeywords: page.seo_keywords || ''
            }],
        meta: {
            ...(page.meta || {}),
            ...(values.tags !== undefined ? { tags: normalizeContentTags(values.tags) } : {}),
            // Presentation is edited by the existing Content/Designer attachment flow.
            // Saving SEO fields must not invent or overwrite a template assignment.
            publish_at: publishAt,
            featuredImage: values.featuredImage?.trim() ?? page.meta?.featuredImage ?? ''
        }
    });
}
/** SPA navigation leaves the shell's initial pageDataPromise behind. Resolve
 * the editor's explicit route id and reject an unrelated cached record. */
export async function loadPageEditorPage(emit, jwt, pathname, adminBase, initial, loader) {
    const prefix = `/${adminBase.replace(/^\/+|\/+$/g, '')}/pages/edit/`;
    if (!pathname.startsWith(prefix))
        return toPage(await initial);
    let pageId;
    try {
        pageId = decodeURIComponent(pathname.slice(prefix.length).replace(/\/$/, ''));
    }
    catch {
        throw new Error('PAGE_EDITOR_ID_INVALID: The editor page id is invalid.');
    }
    if (!/^[A-Za-z0-9_.:-]+$/.test(pageId))
        throw new Error('PAGE_EDITOR_ID_INVALID: The editor page id is invalid.');
    const request = { moduleName: 'runtimeManager', moduleType: 'core', resource: 'pages', action: 'get', params: { pageId } };
    const result = loader?.load
        ? await loader.load('cmsAdminApiRequest', request)
        : await emitRuntimeAdmin(requireEmitter(emit), jwt, 'pages', 'get', { pageId });
    const page = toPage(result);
    if (!page || String(page.id) !== pageId)
        throw new Error('PAGE_EDITOR_PAGE_MISMATCH: The selected page could not be loaded. Reopen it from Pages.');
    return page;
}
export function clearPageEditorCache(pageDataLoader, page) {
    pageDataLoader?.clear?.('cmsAdminApiRequest', {
        moduleName: 'runtimeManager',
        moduleType: 'core',
        resource: 'pages',
        action: 'get',
        params: { pageId: page.id }
    });
}
export async function savePageEditorPage(emit, jwt, page, values) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('cmsAdminApiRequest', buildPageUpdatePayload(jwt, page, values));
}
