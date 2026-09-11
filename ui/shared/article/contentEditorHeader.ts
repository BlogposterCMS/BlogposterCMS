import { articleTitle, type ArticlePage } from './articleData.js';

export type ContentEditorOptions = { language?: string; openDesign?: (page: ArticlePage) => Promise<void> };

/** Shared document chrome; title input changes only this editor's draft. */
export function contentEditorHeader(page: ArticlePage, changed: () => void, openDesign: () => void) {
  const title = document.createElement('input'); title.type = 'text'; title.className = 'article-editor__title';
  title.setAttribute('aria-label', 'Page title'); title.value = articleTitle(page); title.maxLength = 240;
  title.placeholder = 'Untitled'; title.addEventListener('input', changed);
  // Enter edits no content and must not submit the enclosing modal's Close action.
  title.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); title.blur(); } });
  const studio = document.createElement('button'); studio.type = 'button'; studio.className = 'icon-button article-editor__studio';
  studio.title = 'Open in Design Studio'; studio.setAttribute('aria-label', studio.title);
  studio.innerHTML = '<img src="/assets/icons/brush.svg" width="18" height="18" alt="">';
  studio.addEventListener('click', openDesign);
  return { title, studio };
}
