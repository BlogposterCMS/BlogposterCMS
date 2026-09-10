import { emitRuntimeAdmin } from '../api-client/runtimeFacade.js';
import { ownPagePresentation, pageLayoutMeta, presentationMeta } from '../layout/pagePresentation.js';
import { savePageEditorPage, loadPageEditorTranslation } from '../page-editor/pageEditorData.js';
export const ARTICLE_FORMAT = 'article-v1';
/** Own content decides the editor; inherited website designs do not. */
export function pageContentKind(page) {
    if (ownPagePresentation(page))
        return 'design';
    if (page.meta?.htmlFileName)
        return 'html';
    if (page.meta?.contentFormat === ARTICLE_FORMAT)
        return 'article';
    return page.html?.trim() ? 'html' : 'empty';
}
export async function readArticlePage(id, language) {
    if (!window.meltdownEmit)
        throw new Error('ARTICLE_RUNTIME_UNAVAILABLE');
    const selectedLanguage = language || new URLSearchParams(window.location.search).get('contentLang') || undefined;
    const page = selectedLanguage
        ? await loadPageEditorTranslation(window.meltdownEmit, window.ADMIN_TOKEN, String(id), selectedLanguage)
        : await emitRuntimeAdmin(window.meltdownEmit, window.ADMIN_TOKEN, 'pages', 'get', { pageId: id });
    if (!page || String(page.id) !== String(id))
        throw new Error('ARTICLE_PAGE_NOT_FOUND');
    return { ...page, meta: presentationMeta(page) };
}
function contentFingerprint(page) {
    return JSON.stringify([page.html || '', page.meta?.contentFormat, page.meta?.htmlFileName, ownPagePresentation(page)]);
}
async function saveDraft(page) {
    // Reuse the page editor payload so SEO, publication and layout fields survive.
    await savePageEditorPage(window.meltdownEmit, window.ADMIN_TOKEN, page, {
        title: page.trans_title || page.title || '', slug: page.slug || '', status: page.status || 'draft',
        seoDesc: page.meta_desc || '', seoTitle: page.seo_title || '', seoImage: page.seo_image || '',
        publishAt: String(page.meta?.publish_at || ''), featuredImage: String(page.meta?.featuredImage || '')
    });
    window.pageDataLoader?.clear?.();
}
export async function saveArticle(base, html) {
    const current = await readArticlePage(base.id, base.contentLanguage);
    if (contentFingerprint(current) !== contentFingerprint(base))
        throw new Error('ARTICLE_CONTENT_CHANGED: Reload before saving; another editor changed this content.');
    if (!['article', 'empty'].includes(pageContentKind(current)))
        throw new Error('ARTICLE_FORMAT_CONFLICT: Existing HTML/design must not be converted implicitly.');
    const next = { ...current, html, meta: { ...current.meta, contentFormat: ARTICLE_FORMAT } };
    await saveDraft(next);
    return next;
}
export async function createPageDesign(base) {
    if (!window.meltdownEmit)
        throw new Error('ARTICLE_RUNTIME_UNAVAILABLE');
    const current = await readArticlePage(base.id);
    if (pageContentKind(current) !== 'empty')
        throw new Error('PAGE_CONTENT_CHANGED: Reopen the content action.');
    const saved = await emitRuntimeAdmin(window.meltdownEmit, window.ADMIN_TOKEN, 'designer', 'save', {
        design: { title: current.title || 'Page design', isDraft: true }, widgets: []
    });
    if (saved?.id == null)
        throw new Error('PAGE_DESIGN_CREATE_FAILED');
    const latest = await readArticlePage(base.id);
    if (pageContentKind(latest) !== 'empty')
        throw new Error('PAGE_CONTENT_CHANGED: Design saved in Design Studio but not attached.');
    await saveDraft({ ...latest, meta: pageLayoutMeta(latest, 'composed', String(saved.id), current.title) });
    return String(saved.id);
}
