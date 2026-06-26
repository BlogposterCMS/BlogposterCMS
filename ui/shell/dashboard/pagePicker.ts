import {
  createPublicPageForPicker,
  errorMessage,
  fetchPageSlugById,
  fetchPublicPages,
  savePageOrder,
  type PageRecord
} from './pagePickerData.js';
import { bpDialog } from '../../shared/dialogs/bpDialog.js';

type CanvasGridLike = {
  widgets: HTMLElement[];
  addWidget(el: HTMLElement): void;
  removeAll(): void;
  on(eventName: 'change', handler: () => void): void;
};

;(async () => {
  // Use the global emitter function, not an import
  const meltdownEmit = window.meltdownEmit;
  if (typeof meltdownEmit !== 'function') {
    console.error('[PagePicker] meltdownEmit is not available');
    return;
  }
  const emit: NonNullable<Window['meltdownEmit']> = meltdownEmit;
  const jwt         = window.ADMIN_TOKEN;         // injected by your Express route
  const { init: initCanvasGrid } = await import('../../shared/grid/canvasGrid.js');

  // Lightweight grid for arranging pages
  const gridEl = document.querySelector<HTMLElement>('#pagePickerGrid');
  if (!gridEl) {
    console.error('[PagePicker] #pagePickerGrid was not found');
    return;
  }
  gridEl.style.width = '100%';
  gridEl.classList.remove('half-width', 'max-width');

  const columnWidth = 80;
  const columns = Infinity;
  const grid = initCanvasGrid(
    { cellHeight: 1, columnWidth, columns, pushOnOverlap: true, useBoundingBox: true, bboxHandles: false, enableZoom: false },
    gridEl
  ) as unknown as CanvasGridLike;
  // 1) load & render all public pages
  async function loadPages() {
    const pages = await fetchPublicPages(emit, jwt);

    grid.removeAll();  // clear existing items

    pages.forEach((p: PageRecord, idx: number) => {
      const item = document.createElement('div');
      item.classList.add('canvas-item');
      item.dataset.x = '0';
      item.dataset.y = String(idx);
      item.setAttribute('gs-w', '4');
      item.setAttribute('gs-h', '1');
      item.setAttribute('gs-min-w', '4');
      item.setAttribute('gs-min-h', '1');
      item.dataset.pageId = String(p.pageId);

      const content = document.createElement('div');
      content.classList.add('canvas-item-content');
      const title = p.title || 'Untitled';
      const slug = p.slug || '';
      const titleEl = document.createElement('strong');
      titleEl.textContent = title;
      const actions = document.createElement('span');
      actions.style.float = 'right';
      const viewLink = document.createElement('a');
      viewLink.href = `/${slug}`;
      viewLink.target = '_blank';
      viewLink.rel = 'noopener noreferrer';
      viewLink.textContent = 'view';
      const editLink = document.createElement('a');
      editLink.href = `/admin/${slug}`;
      editLink.textContent = 'edit';
      actions.append(viewLink, ' | ', editLink);
      content.append(titleEl, actions);
      item.appendChild(content);

      grid.addWidget(item);
    });
  }

  // 2) persist new order on move
  grid.on('change', () => {
    grid.widgets
      .map(el => ({ el, y: Number(el.dataset.y ?? 0) || 0 }))
      .sort((a, b) => a.y - b.y)
      .forEach((i, idx) => {
        savePageOrder(emit, jwt, Number(i.el.dataset.pageId), idx)
          .catch(err => console.error('order save failed', err));
      });
  });

  // 3) create & redirect
  async function handleCreatePage() {
    const title = await bpDialog.prompt('New page title:', '', {
      prompt: { label: 'Page title', required: true }
    });
    if (!title) return;
    const slug = await bpDialog.prompt('Slug (optional):', '', {
      prompt: { label: 'Slug', placeholder: 'Optional' }
    }) || '';
    try {
      const pageId = await createPublicPageForPicker(emit, jwt, title, slug);
      await loadPages();
      const pageSlug = await fetchPageSlugById(emit, jwt, pageId);
      location.href = `/admin/${pageSlug}`;
    } catch (err) {
      await bpDialog.alert('Error: ' + errorMessage(err));
    }
  }

  // 4) wire up new-page button & initial load
  document.getElementById('newPageBtn')?.addEventListener('click', handleCreatePage);
  await loadPages();
})();
