import { bpDialog } from '/ui/shared/dialogs/bpDialog.js';
import { debounce } from '/ui/shared/utils/debounce.js';
import { pageService, sanitizeSlug } from './pageService.js';

export interface PageRecord {
  id?: string | number;
  title?: string;
  slug?: string;
  status?: string;
  parent_id?: string | number | null;
  lane?: string;
  is_start?: boolean;
}

type FeedbackType = '' | 'success' | 'error';

interface ParentChangeOptions {
  pages: PageRecord[];
  page: PageRecord;
  parentId: string | number | null;
  setFeedback: (type: FeedbackType, message: string) => void;
  service?: typeof pageService;
  fetchPagesFn?: () => Promise<PageRecord[]>;
}

interface IndexedPage {
  page: PageRecord;
  index: number;
  pageId: string | null;
  rowId: string;
}

export interface PageHierarchyRow {
  page: PageRecord;
  rowId: string;
  parentRowId: string | null;
  depth: number;
  childCount: number;
}

const escapeHtml = (str: unknown): string => {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
  map['"'] = '&quot;';
  map["'"] = '&#39;';
  return String(str).replace(/[&<>"']/g, c => map[c] || c);
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function icon(name: string, extraClass?: string): string {
  return typeof window.featherIcon === 'function' ? window.featherIcon(name, extraClass) : '';
}

function pageDomId(value: string): string {
  const safe = String(value || 'row').replace(/[^A-Za-z0-9_-]+/g, '-');
  return `page-list-${safe || 'row'}`;
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element ${selector}`);
  return element;
}

export function normalizePageId(id: unknown): string | null {
  if (id === null || id === undefined || id === '') return null;
  return String(id);
}

export function getDescendantIdSet(pages: PageRecord[], rootId: unknown): Set<string> {
  const normalizedRootId = normalizePageId(rootId);
  const descendants = new Set<string>();
  if (!normalizedRootId) return descendants;

  const queue = [normalizedRootId];
  while (queue.length) {
    const currentId = queue.shift();
    pages.forEach(page => {
      const pageId = normalizePageId(page.id);
      const parentId = normalizePageId(page.parent_id);
      if (!pageId || !parentId) return;
      if (parentId === currentId && !descendants.has(pageId)) {
        descendants.add(pageId);
        queue.push(pageId);
      }
    });
  }

  return descendants;
}

export function getAllowedParentPages(pages: PageRecord[], page: PageRecord): PageRecord[] {
  const pageId = normalizePageId(page.id);
  const lane = page.lane || 'public';
  const descendantIds = getDescendantIdSet(pages, pageId);

  return pages.filter(candidate => {
    const candidateId = normalizePageId(candidate.id);
    if (!candidateId || candidateId === pageId) return false;
    if ((candidate.lane || 'public') !== lane) return false;
    if (descendantIds.has(candidateId)) return false;
    return true;
  });
}

export function getParentValidationError(
  pages: PageRecord[],
  page: PageRecord,
  parentId: unknown
): string | null {
  const normalizedParentId = normalizePageId(parentId);
  if (!normalizedParentId) return null;

  const pageId = normalizePageId(page.id);
  if (normalizedParentId === pageId) return 'A page cannot be its own parent.';

  const parentPage = pages.find(candidate => normalizePageId(candidate.id) === normalizedParentId);
  if (!parentPage) return 'Selected parent page no longer exists.';

  const currentLane = page.lane || 'public';
  const parentLane = parentPage.lane || 'public';
  if (currentLane !== parentLane) return 'Parent page must be in the same lane.';

  const descendantIds = getDescendantIdSet(pages, pageId);
  if (descendantIds.has(normalizedParentId)) {
    return 'Parent selection would create a circular hierarchy.';
  }

  return null;
}

export async function persistParentChange({
  pages,
  page,
  parentId,
  setFeedback,
  service = pageService,
  fetchPagesFn = fetchPages
}: ParentChangeOptions): Promise<boolean> {
  const validationError = getParentValidationError(pages, page, parentId);
  if (validationError) {
    setFeedback('error', validationError);
    return false;
  }

  const normalizedParentId = normalizePageId(parentId);
  const nextParentId = normalizedParentId == null ? null : parentId;

  try {
    await service.updateParent(page, nextParentId);
    const updatedPages = await fetchPagesFn();
    pages.splice(0, pages.length, ...updatedPages);
    setFeedback('success', 'Parent page updated.');
    return true;
  } catch (err) {
    setFeedback('error', `Failed to update parent: ${errorMessage(err)}`);
    return false;
  }
}

export async function fetchPages(): Promise<PageRecord[]> {
  return (await pageService.getAll()) as PageRecord[];
}

export function filterPages(pages: PageRecord[], filter: string): PageRecord[] {
  switch (filter) {
    case 'Active':
      return pages.filter(p => p.status === 'published');
    case 'Drafts':
      return pages.filter(p => p.status === 'draft');
    case 'Deleted':
      return pages.filter(p => p.status === 'deleted');
    default:
      return pages;
  }
}

export function buildPageHierarchyRows(pages: PageRecord[]): PageHierarchyRow[] {
  const indexed: IndexedPage[] = pages.map((page, index) => {
    const pageId = normalizePageId(page.id);
    return {
      page,
      index,
      pageId,
      rowId: pageDomId(`${pageId || 'missing'}-${index}`)
    };
  });
  const pageById = new Map<string, IndexedPage>();
  const childrenByParent = new Map<string, IndexedPage[]>();
  const rows: PageHierarchyRow[] = [];
  const visited = new Set<IndexedPage>();

  indexed.forEach(item => {
    if (item.pageId && !pageById.has(item.pageId)) {
      pageById.set(item.pageId, item);
    }
  });

  indexed.forEach(item => {
    const parentId = normalizePageId(item.page.parent_id);
    if (!parentId || parentId === item.pageId || !pageById.has(parentId)) return;
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) || []), item]);
  });

  // Keep filtered child pages nested under their visible parent, while orphans remain reachable as roots.
  const appendRow = (item: IndexedPage, depth: number): void => {
    if (visited.has(item)) return;
    visited.add(item);

    const parentId = normalizePageId(item.page.parent_id);
    const parentItem = parentId ? pageById.get(parentId) : null;
    const children = item.pageId ? (childrenByParent.get(item.pageId) || []) : [];
    rows.push({
      page: item.page,
      rowId: item.rowId,
      parentRowId: parentItem && parentItem !== item ? parentItem.rowId : null,
      depth,
      childCount: children.length
    });

    children.forEach(child => appendRow(child, depth + 1));
  };

  indexed.forEach(item => {
    const parentId = normalizePageId(item.page.parent_id);
    if (!parentId || parentId === item.pageId || !pageById.has(parentId)) {
      appendRow(item, 0);
    }
  });
  indexed.forEach(item => appendRow(item, 0));

  return rows;
}

export function setupInlineEdit(li: HTMLElement, page: PageRecord): void {
  const titleEl = requireElement<HTMLElement>(li, '.page-name');
  const saveTitle = async () => {
    const newTitle = titleEl.textContent?.trim() || '';
    if (newTitle && newTitle !== page.title) {
      try {
        await pageService.updateTitle(page, newTitle);
        page.title = newTitle;
      } catch (err) {
        await bpDialog.alert('Failed to update title: ' + errorMessage(err));
      }
    }
    titleEl.textContent = page.title || '';
  };
  const debouncedSaveTitle = debounce(saveTitle);
  titleEl.addEventListener('input', debouncedSaveTitle);
  titleEl.addEventListener('blur', () => {
    debouncedSaveTitle.cancel();
    void saveTitle();
  });
  titleEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleEl.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      titleEl.textContent = page.title || '';
      titleEl.blur();
    }
  });

  const slugEl = requireElement<HTMLElement>(li, '.page-slug');
  const saveSlug = async () => {
    const newSlug = sanitizeSlug(slugEl.textContent);
    if (newSlug !== page.slug) {
      try {
        await pageService.updateSlug(page, newSlug);
        page.slug = newSlug;
      } catch (err) {
        await bpDialog.alert('Failed to update slug: ' + errorMessage(err));
      }
    }
    slugEl.textContent = `/${page.slug || ''}`;
  };
  const debouncedSaveSlug = debounce(saveSlug);
  slugEl.addEventListener('input', debouncedSaveSlug);
  slugEl.addEventListener('blur', () => {
    debouncedSaveSlug.cancel();
    void saveSlug();
  });
  slugEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      slugEl.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      slugEl.textContent = `/${page.slug || ''}`;
      slugEl.blur();
    }
  });
}

export async function render(el: HTMLElement | null): Promise<void> {
  if (!el) return;
  try {
    const pages = await fetchPages();
    renderPageList(el, pages);
  } catch (err) {
    el.innerHTML = `<div class="error">Error loading pages: ${escapeHtml(errorMessage(err))}</div>`;
  }
}

export function renderPageList(el: HTMLElement, pages: PageRecord[]): void {
  el.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'page-list-card';
  const inlineError = document.createElement('div');
  inlineError.className = 'page-list-inline-error';
  inlineError.hidden = true;
  inlineError.setAttribute('role', 'alert');

  const clearInlineError = () => {
    inlineError.hidden = true;
    inlineError.textContent = '';
  };

  const setInlineError = (message: string) => {
    inlineError.hidden = !message;
    inlineError.textContent = message || '';
  };

  const titleBar = document.createElement('div');
  titleBar.className = 'page-title-bar';

  const title = document.createElement('div');
  title.className = 'page-title';
  title.textContent = 'Pages';

  const addBtn = document.createElement('img');
  addBtn.src = '/assets/icons/plus.svg';
  addBtn.alt = 'Add page';
  addBtn.title = 'Add new page';
  addBtn.className = 'icon add-page-btn';
  addBtn.addEventListener('click', async () => {
    clearInlineError();
    const pageTitle = await bpDialog.prompt('New page title:');
    if (!pageTitle) return;
    const slugInput = await bpDialog.prompt('Slug (optional):');
    const slug = slugInput ? sanitizeSlug(slugInput) : '';
    try {
      await pageService.create({ title: pageTitle.trim(), slug });
      pages.splice(0, pages.length, ...(await fetchPages()));
      renderFilteredPages();
    } catch (err) {
      const coded = err as { code?: string; userMessage?: string; message?: string };
      if (coded?.code === 'DUPLICATE_SLUG') {
        setInlineError(coded.userMessage || 'This slug is already in use. Please choose another one.');
        return;
      }
      await bpDialog.alert('Error: ' + errorMessage(err));
    }
  });

  titleBar.appendChild(title);
  titleBar.appendChild(addBtn);
  card.appendChild(titleBar);
  card.appendChild(inlineError);

  const filters = ['All', 'Active', 'Drafts', 'Deleted'] as const;
  let currentFilter: string = filters[0];

  const filterNav = document.createElement('nav');
  filterNav.className = 'page-filters';

  const tableWrap = document.createElement('div');
  tableWrap.className = 'page-list-table-wrap';
  const table = document.createElement('table');
  table.className = 'page-list-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th scope="col">Page</th>
        <th scope="col">Slug</th>
        <th scope="col">Status</th>
        <th scope="col">Parent</th>
        <th scope="col">Actions</th>
      </tr>
    </thead>`;
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  tableWrap.appendChild(table);

  filters.forEach((filterName, idx) => {
    const filterEl = document.createElement('span');
    filterEl.className = 'filter';
    filterEl.textContent = filterName;
    if (idx === 0) filterEl.classList.add('active');
    filterEl.onclick = () => {
      filterNav.querySelectorAll('.filter').forEach(f => f.classList.remove('active'));
      filterEl.classList.add('active');
      currentFilter = filterName;
      renderFilteredPages();
    };
    filterNav.appendChild(filterEl);
  });

  card.appendChild(filterNav);
  card.appendChild(tableWrap);
  el.appendChild(card);

  function directChildrenOf(row: HTMLTableRowElement): HTMLTableRowElement[] {
    const rowId = row.dataset.pageRowId;
    if (!rowId) return [];
    return Array.from(tbody.querySelectorAll<HTMLTableRowElement>('tr.page-list-row'))
      .filter(child => child.dataset.parentRowId === rowId);
  }

  function setRowExpanded(row: HTMLTableRowElement, expanded: boolean): void {
    const toggle = row.querySelector<HTMLButtonElement>('.page-list-toggle');
    if (!toggle) return;
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.title = expanded ? 'Hide child pages' : 'Show child pages';
    toggle.innerHTML = icon(expanded ? 'chevron-down' : 'chevron-right', 'expand-page');
    row.classList.toggle('page-list-row-expanded', expanded);
  }

  function collapseDescendants(row: HTMLTableRowElement): void {
    directChildrenOf(row).forEach(child => {
      child.hidden = true;
      setRowExpanded(child, false);
      collapseDescendants(child);
    });
  }

  function toggleChildRows(row: HTMLTableRowElement): void {
    const toggle = row.querySelector<HTMLButtonElement>('.page-list-toggle');
    if (!toggle) return;

    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    setRowExpanded(row, !expanded);
    if (expanded) {
      collapseDescendants(row);
      return;
    }

    directChildrenOf(row).forEach(child => {
      child.hidden = false;
    });
  }

  function appendParentControls(row: HTMLTableRowElement, page: PageRecord): void {
    const parentCell = requireElement<HTMLElement>(row, '.page-list-parent-cell');
    const parentRow = document.createElement('div');
    parentRow.className = 'page-parent-row';

    const parentLabel = document.createElement('label');
    parentLabel.className = 'page-parent-label';
    const parentLabelText = document.createElement('span');
    parentLabelText.className = 'page-parent-label-text';
    parentLabelText.textContent = 'Parent';

    const parentSelect = document.createElement('select');
    parentSelect.className = 'page-parent-select';

    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '-- No parent --';
    parentSelect.appendChild(emptyOption);

    const allowedParents = getAllowedParentPages(pages, page);
    allowedParents.forEach(candidate => {
      const option = document.createElement('option');
      option.value = normalizePageId(candidate.id) || '';
      option.textContent = candidate.title || `Page ${candidate.id}`;
      parentSelect.appendChild(option);
    });

    const currentParentId = normalizePageId(page.parent_id);
    if (currentParentId && !allowedParents.some(candidate => normalizePageId(candidate.id) === currentParentId)) {
      const invalidOption = document.createElement('option');
      invalidOption.value = currentParentId;
      invalidOption.textContent = '(invalid parent)';
      parentSelect.appendChild(invalidOption);
    }

    parentSelect.value = currentParentId || '';

    const feedback = document.createElement('div');
    feedback.className = 'page-parent-feedback';
    feedback.setAttribute('aria-live', 'polite');

    const setFeedback = (type: FeedbackType, message: string) => {
      feedback.textContent = message;
      feedback.classList.remove('is-success', 'is-error');
      if (type === 'success') feedback.classList.add('is-success');
      if (type === 'error') feedback.classList.add('is-error');
    };

    parentSelect.addEventListener('change', async () => {
      const previousParentId = normalizePageId(page.parent_id) || '';
      parentSelect.disabled = true;
      setFeedback('', 'Saving...');

      const didUpdate = await persistParentChange({
        pages,
        page,
        parentId: parentSelect.value || null,
        setFeedback
      });

      parentSelect.disabled = false;
      if (didUpdate) {
        renderFilteredPages();
      } else {
        parentSelect.value = previousParentId;
      }
    });

    parentLabel.appendChild(parentLabelText);
    parentLabel.appendChild(parentSelect);
    parentRow.appendChild(parentLabel);
    parentRow.appendChild(feedback);
    parentCell.appendChild(parentRow);
  }

  function renderPageRow(hierarchy: PageHierarchyRow): HTMLTableRowElement {
    const { page } = hierarchy;
    const row = document.createElement('tr');
    row.className = 'page-list-row';
    row.dataset.pageRowId = hierarchy.rowId;
    if (hierarchy.parentRowId) row.dataset.parentRowId = hierarchy.parentRowId;
    row.hidden = hierarchy.depth > 0;

    const hasChildren = hierarchy.childCount > 0;
    row.innerHTML = `
      <td class="page-list-title-cell">
        <span class="page-list-title-inner" style="padding-left: ${hierarchy.depth * 18}px">
          ${hasChildren
            ? `<button class="page-list-toggle" type="button" aria-expanded="false" title="Show child pages">${icon('chevron-right', 'expand-page')}</button>`
            : '<span class="page-list-toggle-placeholder"></span>'}
          <span class="page-name" contenteditable="true">${escapeHtml(page.title)}</span>
        </span>
      </td>
      <td class="page-list-slug-cell">
        <span class="page-slug-row">
          ${page.is_start
            ? `<span class="page-list-home-indicator home-indicator" title="Current home page">${icon('house')}</span>`
            : `<button class="page-list-home-button set-home" type="button" title="Set as home page">${icon('house-plus')}</button>`}
          <span class="page-slug" contenteditable="true">/${escapeHtml(page.slug)}</span>
        </span>
      </td>
      <td class="page-list-status-cell">${escapeHtml(page.status || 'draft')}</td>
      <td class="page-list-parent-cell"></td>
      <td class="page-actions page-list-actions">
        <button class="page-action-button edit-page" type="button" title="Edit page">${icon('pencil')}</button>
        <button class="page-action-button toggle-draft" type="button" title="${page.status === 'draft' ? 'Mark as published' : 'Mark as draft'}">${icon('drafting-compass')}</button>
        <button class="page-action-button view-page" type="button" title="Open page">${icon('external-link')}</button>
        <button class="page-action-button share-page" type="button" title="Share page link">${icon('share-2')}</button>
        <button class="page-action-button delete-page" type="button" title="Delete page">${icon('trash-2')}</button>
      </td>`;

    if (hasChildren) {
      requireElement<HTMLButtonElement>(row, '.page-list-toggle').addEventListener('click', () => {
        toggleChildRows(row);
      });
    }

    setupInlineEdit(row, page);
    appendParentControls(row, page);

    const setHomeBtn = row.querySelector('.set-home');
    if (setHomeBtn) setHomeBtn.addEventListener('click', async () => {
      try {
        await pageService.setAsStart(page.id ?? '');
        pages.splice(0, pages.length, ...(await fetchPages()));
        renderFilteredPages();
      } catch (err) {
        await bpDialog.alert('Failed to set start page: ' + errorMessage(err));
      }
    });

    requireElement(row, '.edit-page').addEventListener('click', () => editPage(page.id));
    requireElement(row, '.toggle-draft').addEventListener('click', async () => {
      const newStatus = page.status === 'draft' ? 'published' : 'draft';
      const prevStatus = page.status;
      page.status = newStatus;
      renderFilteredPages();
      try {
        await pageService.updateStatus(page, newStatus);
      } catch (err) {
        page.status = prevStatus;
        renderFilteredPages();
        await bpDialog.alert('Failed to update status: ' + errorMessage(err));
      }
    });
    requireElement(row, '.view-page').addEventListener('click', () => viewPage(page));
    requireElement(row, '.share-page').addEventListener('click', () => {
      void sharePage(page);
    });
    requireElement(row, '.delete-page').addEventListener('click', async () => {
      if (!(await bpDialog.confirm('Are you sure you want to delete this page?'))) return;
      try {
        await pageService.delete(page.id ?? '');
        const idx = pages.indexOf(page);
        if (idx > -1) pages.splice(idx, 1);
        renderFilteredPages();
      } catch (err) {
        await bpDialog.alert('Failed to delete page: ' + errorMessage(err));
      }
    });

    return row;
  }

  function renderFilteredPages(): void {
    const filteredPages = filterPages(pages, currentFilter);
    tbody.innerHTML = '';
    if (!filteredPages.length) {
      const empty = document.createElement('tr');
      empty.className = 'page-list-empty-row';
      const cell = document.createElement('td');
      cell.className = 'empty-state';
      cell.colSpan = 5;
      cell.textContent = 'No pages found.';
      empty.appendChild(cell);
      tbody.appendChild(empty);
      return;
    }

    buildPageHierarchyRows(filteredPages)
      .forEach(hierarchy => tbody.appendChild(renderPageRow(hierarchy)));
  }

  renderFilteredPages();
}

async function editPage(id: unknown): Promise<void> {
  window.location.href = `/admin/pages/edit/${id}`;
}

function viewPage(page: PageRecord): void {
  window.open(`/${page.slug || ''}`, '_blank');
}

async function sharePage(page: PageRecord): Promise<void> {
  const url = `${window.location.origin}/${page.slug || ''}`;
  try {
    await navigator.clipboard.writeText(url);
    await bpDialog.alert('Page link copied to clipboard');
  } catch {
    await bpDialog.alert(url);
  }
}
