import type { ContentEditorOptions } from './contentEditorHeader.js';
type ArticleRuntime = { openArticleEditor: (pageId: string | number, onSaved?: () => void | Promise<void>, options?: ContentEditorOptions) => Promise<void> };
declare global { interface Window { BlogposterArticleEditor?: ArticleRuntime; } }
let loading: Promise<unknown> | undefined;

/** Lazy bundled editor; no remote scripts or extra runtime/service boundary. */
export async function loadArticleEditor(): Promise<ArticleRuntime> {
  if (!window.BlogposterArticleEditor) {
    // Sandboxed AppLoader modules have an opaque import base. An absolute same-host
    // module URL uses the established CORS asset route without relaxing the sandbox.
    const url = new URL('/build/articleEditor.js', window.location.href).href;
    loading ||= import(/* webpackIgnore: true */ url).catch(error => { loading = undefined; throw error; });
    await loading;
  }
  if (!window.BlogposterArticleEditor) throw new Error('ARTICLE_EDITOR_LOAD_FAILED');
  return window.BlogposterArticleEditor;
}

export async function openArticle(pageId: string | number, onSaved?: () => void | Promise<void>, options?: ContentEditorOptions) {
  const editor = await loadArticleEditor();
  await editor.openArticleEditor(pageId, onSaved, options);
}
