import { articleTitle } from './articleData.js';
import { mountTooltips } from '../overlays/tooltip.js';
/** Shared document chrome; title input changes only this editor's draft. */
export function contentEditorHeader(page, changed, openDesign) {
    const title = document.createElement('input');
    title.type = 'text';
    title.className = 'article-editor__title';
    title.setAttribute('aria-label', 'Page title');
    title.value = articleTitle(page);
    title.maxLength = 240;
    title.placeholder = 'Untitled';
    title.addEventListener('input', changed);
    // Enter edits no content and must not submit the enclosing modal's Close action.
    title.addEventListener('keydown', event => { if (event.key === 'Enter') {
        event.preventDefault();
        title.blur();
    } });
    const studio = document.createElement('button');
    studio.type = 'button';
    studio.className = 'icon-button article-editor__studio';
    studio.dataset.bpTooltip = 'Open in Design Studio';
    studio.setAttribute('aria-label', studio.dataset.bpTooltip);
    studio.innerHTML = '<img src="/assets/icons/brush.svg" width="18" height="18" alt="">';
    studio.addEventListener('click', openDesign);
    const tooltip = mountTooltips(studio);
    return { title, studio, destroy: () => tooltip.stop() };
}
