import { render as renderPages, renderPageList, type PageRecord } from '../pageList/pageList.js';
import type { CollectionView } from './collectionsListData.js';

/** Compatibility for saved collection widget instances: Pages owns the editor. */
export async function render(el: HTMLElement | null): Promise<void> {
  await renderPages(el, { initialFilter: 'Collections' });
}

/** Existing callers with a collection snapshot enter the same hierarchy view. */
export function renderCollectionsList(el: HTMLElement, collections: CollectionView[]): void {
  const pages = new Map<string, PageRecord>();
  for (const collection of collections) {
    pages.set(collection.id, collection.page as PageRecord);
    for (const child of collection.children) pages.set(child.id, child.page as PageRecord);
  }
  renderPageList(el, Array.from(pages.values()), { initialFilter: 'Collections' });
}
