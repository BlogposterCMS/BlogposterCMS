let loading;
/** Lazy bundled editor; no remote scripts or extra runtime/service boundary. */
export async function openArticle(pageId, onSaved) {
    if (!window.BlogposterArticleEditor) {
        const url = '/build/articleEditor.js';
        loading ||= import(/* webpackIgnore: true */ url).catch(error => { loading = undefined; throw error; });
        await loading;
    }
    if (!window.BlogposterArticleEditor)
        throw new Error('ARTICLE_EDITOR_LOAD_FAILED');
    await window.BlogposterArticleEditor.openArticleEditor(pageId, onSaved);
}
