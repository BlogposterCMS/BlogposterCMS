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
    const page = await loadPageEditorTranslation(window.meltdownEmit, window.ADMIN_TOKEN, String(id), selectedLanguage);
    if (!page || String(page.id) !== String(id))
        throw new Error('ARTICLE_PAGE_NOT_FOUND');
    return { ...page, meta: presentationMeta(page) };
}
function contentFingerprint(page) {
    return JSON.stringify([page.html || '', page.css || '', page.meta?.contentFormat, page.meta?.htmlFileName, ownPagePresentation(page)]);
}
export async function saveContentPageDraft(page) {
    // Reuse the page editor payload so SEO, publication and layout fields survive.
    await savePageEditorPage(window.meltdownEmit, window.ADMIN_TOKEN, page, {
        title: page.trans_title || page.title || '', slug: page.slug || '', status: page.status || 'draft',
        seoDesc: page.meta_desc || '', seoTitle: page.seo_title || '', seoImage: page.seo_image || '',
        publishAt: String(page.meta?.publish_at || ''), featuredImage: String(page.meta?.featuredImage || '')
    });
    window.pageDataLoader?.clear?.();
}
export function articleTitle(page) { return page.trans_title ?? page.title ?? ''; }
function withTitle(current, base, title) {
    if (title === undefined || title === articleTitle(base))
        return current;
    if (articleTitle(current) !== articleTitle(base))
        throw new Error('ARTICLE_TITLE_CHANGED: Reload before saving; another editor changed the title.');
    if (!title.trim() || title.trim().length > 240)
        throw new Error('ARTICLE_TITLE_INVALID: Enter a title between 1 and 240 characters.');
    // Preserve explicit SEO overrides; the public resolver derives its fallback from this title.
    return { ...current, trans_title: title.trim(), ...(!current.contentLanguage || current.contentLanguage === current.language ? { title: title.trim() } : {}) };
}
export async function saveArticle(base, html, title, progress) {
    const current = await readArticlePage(base.id, base.contentLanguage);
    if (contentFingerprint(current) !== contentFingerprint(base))
        throw new Error('ARTICLE_CONTENT_CHANGED: Reload before saving; another editor changed this content.');
    if (!['article', 'empty'].includes(pageContentKind(current)))
        throw new Error('ARTICLE_FORMAT_CONFLICT: Existing HTML/design must not be converted implicitly.');
    const locale = current.contentLanguage || current.language || 'en';
    const next = { ...withTitle(current, base, title), html, meta: { ...current.meta, contentFormat: ARTICLE_FORMAT,
            ...(progress ? { articleTranslations: { ...current.meta?.articleTranslations, [locale]: progress } } : {}) } };
    await saveContentPageDraft(next);
    return { ...next, trans_lang: next.contentLanguage || next.language || 'en' };
}
/** Existing imported HTML has its own source editor; never feed arbitrary layouts through a rich-text schema. */
export async function saveHtmlContent(base, html, css, title) {
    const current = await readArticlePage(base.id, base.contentLanguage);
    if (contentFingerprint(current) !== contentFingerprint(base))
        throw new Error('ARTICLE_CONTENT_CHANGED: Reload before saving; another editor changed this content.');
    if (pageContentKind(current) !== 'html')
        throw new Error('ARTICLE_FORMAT_CONFLICT: Reopen the current content editor.');
    const next = { ...withTitle(current, base, title), html, css };
    await saveContentPageDraft(next);
    return { ...next, trans_lang: next.contentLanguage || next.language || 'en' };
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
    await saveContentPageDraft({ ...latest, meta: pageLayoutMeta(latest, 'composed', String(saved.id), current.title) });
    return String(saved.id);
}
