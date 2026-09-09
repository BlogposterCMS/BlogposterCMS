type ArticleRuntime = { openArticleEditor: (pageId: string | number, onSaved?: () => void | Promise<void>) => Promise<void> };
declare global { interface Window { BlogposterArticleEditor?: ArticleRuntime; } }
let loading: Promise<unknown> | undefined;

/** Lazy bundled editor; no remote scripts or extra runtime/service boundary. */
export async function openArticle(pageId: string | number, onSaved?: () => void | Promise<void>) {
  if (!window.BlogposterArticleEditor) {
    const url = '/build/articleEditor.js';
    loading ||= import(/* webpackIgnore: true */ url).catch(error => { loading = undefined; throw error; });
    await loading;
  }
  if (!window.BlogposterArticleEditor) throw new Error('ARTICLE_EDITOR_LOAD_FAILED');
  await window.BlogposterArticleEditor.openArticleEditor(pageId, onSaved);
}
