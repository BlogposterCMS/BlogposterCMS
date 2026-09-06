import { render as renderPages, renderPageList } from '../pageList/pageList.js';
/** Compatibility for saved collection widget instances: Pages owns the editor. */
export async function render(el) {
    await renderPages(el, { initialFilter: 'Collections' });
}
/** Existing callers with a collection snapshot enter the same hierarchy view. */
export function renderCollectionsList(el, collections) {
    const pages = new Map();
    for (const collection of collections) {
        pages.set(collection.id, collection.page);
        for (const child of collection.children)
            pages.set(child.id, child.page);
    }
    renderPageList(el, Array.from(pages.values()), { initialFilter: 'Collections' });
}
