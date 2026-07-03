import {
  createCollection,
  errorMessage,
  fetchCollections,
  type CollectionChildView,
  type CollectionView
} from './collectionsListData.js';
import { bpDialog } from '/ui/shared/dialogs/bpDialog.js';
import { sanitizeSlug } from '/ui/widgets/plainspace/admin/defaultwidgets/pageList/pageService.js';

interface RenderCollectionsListOptions {
  onCreateCollection?: () => Promise<void> | void;
}

function escapeHtml(value: unknown): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, char => map[char] || char);
}

function icon(name: string, extraClass = ''): string {
  return typeof window.featherIcon === 'function'
    ? window.featherIcon(name, extraClass)
    : `<img class="${escapeHtml(extraClass)}" src="/assets/icons/${escapeHtml(name)}.svg" alt="${escapeHtml(name)}" />`;
}

function domId(value: string): string {
  const safe = String(value || 'collection').replace(/[^A-Za-z0-9_-]+/g, '-');
  return `collections-list-children-${safe || 'collection'}`;
}

function renderEmpty(tbody: HTMLTableSectionElement): void {
  const empty = document.createElement('tr');
  empty.className = 'collections-list-empty-row';
  const cell = document.createElement('td');
  cell.className = 'empty-state';
  cell.colSpan = 6;
  cell.textContent = 'No collections found.';
  empty.appendChild(cell);
  tbody.appendChild(empty);
}

function createErrorMessage(err: unknown): string {
  const coded = err as { code?: string; userMessage?: string };
  if (coded?.code === 'DUPLICATE_SLUG') {
    return coded.userMessage || 'This slug is already in use. Please choose another one.';
  }
  return `PLAINSPACE_COLLECTIONS_CREATE_FAILED: ${errorMessage(err)}`;
}

function renderChildPageRows(children: CollectionChildView[]): string {
  return children.map(child => `
    <tr class="collections-list-child-page-row">
      <td>
        <span class="page-name" title="${escapeHtml(child.title)}">${escapeHtml(child.title)}</span>
      </td>
      <td class="page-slug">/${escapeHtml(child.slug)}</td>
      <td>${escapeHtml(child.status)}</td>
      <td class="page-actions collections-list-actions">
        <a href="${escapeHtml(child.editUrl)}" title="Edit child page">${icon('pencil', 'edit-page')}</a>
        <a href="${escapeHtml(child.publicUrl)}" target="_blank" rel="noopener noreferrer" title="Open child page">${icon('external-link', 'view-page')}</a>
      </td>
    </tr>`).join('');
}

function renderCollectionRows(collection: CollectionView): HTMLTableRowElement[] {
  const childRowId = domId(collection.id);
  const hasChildren = collection.children.length > 0;
  const row = document.createElement('tr');
  row.className = 'collections-list-row';
  row.innerHTML = `
    <td class="collections-list-title-cell">
      <span class="collections-list-title-inner">
        ${hasChildren
          ? `<button class="collections-list-toggle" type="button" aria-expanded="false" aria-controls="${escapeHtml(childRowId)}" title="Show child pages">${icon('chevron-right', 'expand-collection')}</button>`
          : '<span class="collections-list-toggle-placeholder"></span>'}
        <span class="page-name" title="${escapeHtml(collection.title)}">${escapeHtml(collection.title)}</span>
      </span>
    </td>
    <td class="page-slug">/${escapeHtml(collection.slug)}</td>
    <td>${escapeHtml(collection.status)}</td>
    <td>${collection.childCount} child page${collection.childCount === 1 ? '' : 's'}</td>
    <td>${escapeHtml(collection.indicator)}</td>
    <td class="page-actions collections-list-actions">
      <a href="${escapeHtml(collection.editUrl)}" title="Edit collection parent page">${icon('pencil', 'edit-page')}</a>
      <a href="${escapeHtml(collection.publicUrl)}" target="_blank" rel="noopener noreferrer" title="Open collection page">${icon('external-link', 'view-page')}</a>
    </td>`;

  if (!hasChildren) return [row];

  const childRow = document.createElement('tr');
  childRow.id = childRowId;
  childRow.className = 'collections-list-child-row';
  childRow.hidden = true;
  childRow.innerHTML = `
    <td colspan="6">
      <table class="collections-list-child-table">
        <thead>
          <tr>
            <th scope="col">Child page</th>
            <th scope="col">Slug</th>
            <th scope="col">Status</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>${renderChildPageRows(collection.children)}</tbody>
      </table>
    </td>`;

  const toggle = row.querySelector<HTMLButtonElement>('.collections-list-toggle');
  toggle?.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    toggle.title = expanded ? 'Show child pages' : 'Hide child pages';
    toggle.innerHTML = icon(expanded ? 'chevron-right' : 'chevron-down', 'expand-collection');
    row.classList.toggle('collections-list-row-expanded', !expanded);
    childRow.hidden = expanded;
  });

  return [row, childRow];
}

export function renderCollectionsList(
  el: HTMLElement,
  collections: CollectionView[],
  options: RenderCollectionsListOptions = {}
): void {
  el.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'collections-list-card page-list-card';
  const inlineError = document.createElement('div');
  inlineError.className = 'collections-list-inline-error page-list-inline-error';
  inlineError.hidden = true;
  inlineError.setAttribute('role', 'alert');

  const setInlineError = (message: string) => {
    inlineError.hidden = !message;
    inlineError.textContent = message || '';
  };

  const titleBar = document.createElement('div');
  titleBar.className = 'collections-list-title-bar page-title-bar';
  const title = document.createElement('div');
  title.className = 'collections-list-title page-title';
  title.textContent = 'Collections';
  titleBar.appendChild(title);

  if (options.onCreateCollection) {
    const addBtn = document.createElement('img');
    addBtn.src = '/assets/icons/plus.svg';
    addBtn.alt = 'Add collection';
    addBtn.title = 'Add new collection';
    addBtn.className = 'icon add-page-btn add-collection-btn';
    addBtn.addEventListener('click', async () => {
      setInlineError('');
      try {
        await options.onCreateCollection?.();
      } catch (err) {
        setInlineError(createErrorMessage(err));
      }
    });
    titleBar.appendChild(addBtn);
  }

  card.appendChild(titleBar);
  card.appendChild(inlineError);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'collections-list-table-wrap';
  const table = document.createElement('table');
  table.className = 'collections-list collections-list-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th scope="col">Collection</th>
        <th scope="col">Slug</th>
        <th scope="col">Status</th>
        <th scope="col">Children</th>
        <th scope="col">Layout</th>
        <th scope="col">Actions</th>
      </tr>
    </thead>`;
  const tbody = document.createElement('tbody');
  if (!collections.length) {
    renderEmpty(tbody);
  } else {
    collections.forEach(collection => renderCollectionRows(collection).forEach(row => tbody.appendChild(row)));
  }
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  card.appendChild(tableWrap);
  el.appendChild(card);
}

export async function render(el: HTMLElement | null): Promise<void> {
  if (!el) return;
  try {
    let renderCurrent: () => Promise<void>;
    const handleCreateCollection = async () => {
      const title = await bpDialog.prompt('New collection title:');
      const trimmedTitle = title?.trim();
      if (!trimmedTitle) return;
      const slugInput = await bpDialog.prompt('Slug (optional):');
      const slug = slugInput ? sanitizeSlug(slugInput) : '';

      await createCollection(window.meltdownEmit, window.ADMIN_TOKEN, {
        title: trimmedTitle,
        slug
      });
      await renderCurrent();
    };

    renderCurrent = async () => {
      const collections = await fetchCollections(window.meltdownEmit, window.ADMIN_TOKEN);
      renderCollectionsList(el, collections, { onCreateCollection: handleCreateCollection });
    };

    await renderCurrent();
  } catch (err) {
    el.innerHTML = `<div class="error">PLAINSPACE_COLLECTIONS_LOAD_FAILED: ${escapeHtml(errorMessage(err))}</div>`;
  }
}
