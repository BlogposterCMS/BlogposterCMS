import { bpDialog } from '../../../shared/dialogs/bpDialog.js';
import { ownPagePresentation } from '../../../shared/layout/pagePresentation.js';
import { pageContentKind, readArticlePage } from '../../../shared/article/articleData.js';
import { DOCUMENT_MODE_WARNING, reuseContentDesign, useDocumentEditor } from '../../../shared/article/pageEditorMode.js';
import { openArticle, loadArticleEditor } from '../../../shared/article/articleLoader.js';
let currentDesignId;
const context = () => {
    const query = new URLSearchParams(window.location.search);
    return { pageId: query.get('contentPageId') || '', language: query.get('lang') || query.get('contentLang') || undefined };
};
export const documentEditorModeState = () => ({ ...context(), designId: currentDesignId?.() || '', warning: DOCUMENT_MODE_WARNING });
/** The page association is checked again at execution; a query string is never write authority. */
export async function openDocumentMode() {
    const { pageId, language } = context();
    const designId = currentDesignId?.();
    if (!pageId || !designId)
        throw new Error('PAGE_DOCUMENT_CONTEXT_REQUIRED: Open Design Studio from a page first.');
    const snapshot = window.blogposterDesignerCommands?.snapshot?.();
    if (snapshot?.save?.dirty || snapshot?.save?.busy || snapshot?.publishing?.busy)
        throw new Error('PAGE_DESIGN_SAVE_REQUIRED: Save the design before switching editors.');
    let page = await readArticlePage(pageId, language);
    // Load the editor before changing the association. A failed asset request must
    // leave the page's current design selected.
    const htmlEditor = page.meta?.htmlFileName || (page.html?.trim() && page.meta?.contentFormat !== 'article-v1')
        ? await import('../../../shared/article/htmlContentEditor.js') : null;
    if (!htmlEditor)
        await loadArticleEditor();
    const own = ownPagePresentation(page);
    if (own)
        page = await useDocumentEditor(pageId, designId, language);
    const options = { language, openDesign: (value) => reuseContentDesign(value, designId) };
    // Opening another surface must complete the command so the agent can then edit that document.
    const opened = htmlEditor
        ? htmlEditor.openHtmlContentEditor(pageId, undefined, options)
        : openArticle(pageId, undefined, options);
    void opened.catch(error => bpDialog.alert(error instanceof Error ? error.message : 'PAGE_DOCUMENT_OPEN_FAILED'));
    return { pageId, editor: pageContentKind(page) === 'html' ? 'html-content' : 'article' };
}
export const documentEditorModeAction = {
    action: 'page.openDocument', label: 'Use document editor', category: 'document', description: DOCUMENT_MODE_WARNING, params: []
};
export function mountPageContentSwitch(header, getDesignId) {
    currentDesignId = getDesignId;
    if (!context().pageId)
        return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button header-icon-btn';
    button.title = 'Use document editor';
    button.setAttribute('aria-label', button.title);
    button.innerHTML = '<img src="/assets/icons/file-text.svg" width="18" height="18" alt="">';
    button.addEventListener('click', () => {
        void (async () => {
            if (await bpDialog.confirm(DOCUMENT_MODE_WARNING, { title: 'Switch to document editor?', confirmLabel: 'Use document editor' }))
                await openDocumentMode();
        })().catch(error => bpDialog.alert(error instanceof Error ? error.message : 'PAGE_DOCUMENT_OPEN_FAILED'));
    });
    (header.querySelector('.header-actions') || header).append(button);
}
