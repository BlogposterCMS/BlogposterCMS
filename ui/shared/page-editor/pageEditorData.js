import { emitRuntimeAdmin, runtimeAdminPayload } from '../api-client/runtimeFacade.js';
import { normalizeContentTags } from '../content/contentTags.js';
/** Selection is editor state; it never changes the page's primary language. */
export function normalizePageLanguage(value) {
    if (typeof value !== 'string' || !/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i.test(value.trim()) || value.trim().length > 35) {
        throw new Error('PAGE_EDITOR_LANGUAGE_INVALID: Enter a language code such as en or zh-CN.');
    }
    return value.trim().toLowerCase();
}
// Keep page-manager and layout-template event payloads outside the DOM widget.
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('PLAINSPACE_PAGE_EDITOR_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
export function toPage(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const page = value;
    if (!Object.hasOwn(page, 'translation'))
        return page;
    // Mongo returns the same translated fields nested; SQL adapters flatten them.
    // Normalize the read shape without inventing fallback text for a missing locale.
    const translation = page.translation;
    const text = (key) => typeof translation?.[key] === 'string' ? translation[key] : '';
    return { ...page, trans_lang: text('language') || null, trans_title: text('title'),
        html: text('html'), css: text('css'), meta_desc: text('meta_desc'),
        seo_title: text('seo_title'), seo_keywords: text('seo_keywords') };
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
    const secondary = page.contentLanguage && page.contentLanguage !== (page.language || 'en');
    return runtimeAdminPayload(jwt, 'pages', 'update', {
        pageId: page.id,
        slug,
        status,
        seo_image: seoImage,
        parent_id: page.parent_id,
        is_content: page.is_content,
        lane: page.lane,
        // Editing a translation must not overwrite a concurrently edited primary title.
        ...(secondary ? {} : { language: page.language, title }),
        translations: [{
                language: page.contentLanguage || page.language,
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
export async function loadPageEditorPage(emit, jwt, pathname, adminBase, initial, loader, language) {
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
    return loadPageEditorTranslation(emit, jwt, pageId, language, loader);
}
export async function loadPageEditorTranslation(emit, jwt, pageId, language, loader) {
    const locale = language ? normalizePageLanguage(language) : undefined;
    const params = { pageId, ...(locale ? { language: locale } : {}) };
    const request = { moduleName: 'runtimeManager', moduleType: 'core', resource: 'pages', action: 'get', params };
    // Shared metadata can change from another locale. A deliberate language switch
    // must read its current value, including translations that were absent before.
    if (locale)
        loader?.clear?.('cmsAdminApiRequest', request);
    const result = loader?.load
        ? await loader.load('cmsAdminApiRequest', request)
        : await emitRuntimeAdmin(requireEmitter(emit), jwt, 'pages', 'get', params);
    const page = toPage(result);
    if (!page || String(page.id) !== pageId)
        throw new Error('PAGE_EDITOR_PAGE_MISMATCH: The selected page could not be loaded. Reopen it from Pages.');
    // The default backend projection is English. Open a different primary locale
    // explicitly instead of presenting its absent English body as the source.
    if (!locale && page.language && page.language !== 'en')
        return loadPageEditorTranslation(emit, jwt, pageId, page.language, loader);
    return locale ? { ...page, contentLanguage: locale } : page;
}
export function clearPageEditorCache(pageDataLoader, page) {
    pageDataLoader?.clear?.('cmsAdminApiRequest', {
        moduleName: 'runtimeManager',
        moduleType: 'core',
        resource: 'pages',
        action: 'get',
        params: { pageId: page.id }
    });
    if (page.contentLanguage)
        pageDataLoader?.clear?.('cmsAdminApiRequest', {
            moduleName: 'runtimeManager', moduleType: 'core', resource: 'pages', action: 'get',
            params: { pageId: page.id, language: page.contentLanguage }
        });
}
export async function savePageEditorPage(emit, jwt, page, values) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('cmsAdminApiRequest', buildPageUpdatePayload(jwt, page, values));
}
