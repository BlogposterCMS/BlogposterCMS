import { bpDialog } from '/ui/shared/dialogs/bpDialog.js';
import { openPopover } from '/ui/shared/overlays/popover.js';
import { registerWorkspaceAgent, readAgentForm, patchAgentForm, agentString } from '/ui/shared/agent/workspaceAgent.js';
import { registerWorkspaceChanges } from '/ui/shared/navigation/workspaceChanges.js';
import enhanceSelects from '/ui/shared/controls/customSelect.js';
import { debounce } from '/ui/shared/utils/debounce.js';
import { pageService, sanitizeSlug } from './pageService.js';
import { createPageTagFilter, matchesPageTags, pageTags } from './pageTagFilter.js';
import { renderPageDesignPreview } from './pageDesignPreview.js';
import { openArticle } from '/ui/shared/article/articleLoader.js';
import { readArticlePage, pageContentKind, createPageDesign } from '/ui/shared/article/articleData.js';
import { missingContentSlot, CONTENT_SLOT_HTML } from '/ui/shared/article/contentSlot.js';
import { emitRuntimeAdmin } from '/ui/shared/api-client/runtimeFacade.js';
import { pagePresentationFromList } from '/ui/shared/layout/pagePresentation.js';
import { loadSiteMainDesign, saveSiteMainDesign } from '/ui/shared/layout/siteMainDesign.js';
import { fetchPublishedDesigns, type DesignRecord } from '../../pageEditorWidgets/pageContentData.js';
import { promptDocsExampleImport, runDocsExampleImport, type DocsExampleImport } from '../../exampleImportControl.js';
import { deriveCollections, type PageRecord as CollectionPageRecord } from '../collectionsList/collectionsListData.js';

export interface PageRecord extends CollectionPageRecord {
  id?: string | number;
  title?: string;
  slug?: string;
  status?: string;
  parent_id?: string | number | null;
  lane?: string;
  is_start?: boolean;
  meta?: Record<string, unknown> | null;
}

export interface PageManagerOptions {
  initialFilter?: 'All' | 'Collections';
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
    // Preserve an existing relationship in the form, but never offer a trashed
    // page as a new parent. Omitting the current parent would silently reparent.
    if (candidate.status === 'deleted' && candidateId !== normalizePageId(page.parent_id)) return false;
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
  if (parentPage.status === 'deleted' && normalizedParentId !== normalizePageId(page.parent_id)) {
    return 'A deleted page cannot be selected as a new parent.';
  }

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
    case 'Collections':
      return deriveCollections(pages).map(collection => collection.page as PageRecord);
    default:
      return pages.filter(page => page.status !== 'deleted');
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
      // A recovered orphan/cycle root has no visible parent, even if stale data points to one.
      parentRowId: depth > 0 && parentItem && parentItem !== item ? parentItem.rowId : null,
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

export async function render(el: HTMLElement | null, options: PageManagerOptions = {}): Promise<void> {
  if (!el) return;
  el.innerHTML = '<p role="status">Loading pages…</p>';
  try {
    renderPageList(el, await fetchPages(), options);
  } catch (err) {
    el.innerHTML = `<p role="alert">PAGE_MANAGER_LOAD_FAILED: ${escapeHtml(errorMessage(err))}</p><button type="button" class="button secondary sm">Retry</button>`;
    el.querySelector('button')?.addEventListener('click', () => void render(el, options));
  }
}

/** Include ancestors so a search result never loses its place in the page hierarchy. */
export function matchingHierarchyRows(pages: PageRecord[], filter: string, query: string, tags: string[] = []): PageHierarchyRow[] {
  const rows = buildPageHierarchyRows(pages);
  // Collections use the same Pages records, including their children. Their
  // count remains the number of parent/marked pages, not the visible row count.
  const candidates = filter === 'Collections'
    ? deriveCollections(pages).flatMap(collection => [collection.page, ...collection.children.map(child => child.page)])
    : filterPages(pages, filter);
  const matches = new Set(candidates.filter(page =>
    `${page.title || ''} ${page.slug || ''}`.toLowerCase().includes(query.trim().toLowerCase()) && matchesPageTags(page, tags)
  ));
  const included = new Set(rows.filter(row => matches.has(row.page)).map(row => row.rowId));
  const byId = new Map(rows.map(row => [row.rowId, row]));
  for (const rowId of Array.from(included)) {
    let parent = byId.get(rowId)?.parentRowId;
    const visited = new Set<string>();
    while (parent && !visited.has(parent)) {
      visited.add(parent);
      included.add(parent);
      parent = byId.get(parent)?.parentRowId;
    }
  }
  return rows.filter(row => included.has(row.rowId));
}

export function renderPageList(el: HTMLElement, pages: PageRecord[], options: PageManagerOptions = {}): void {
  let mainDesign = '';
  let designLibrary: DesignRecord[] = [];
  let mainDesignLoading = true;
  let mainDesignError = '';
  let currentFilter = options.initialFilter === 'Collections' ? 'Collections' : 'All';
  const initialPages = filterPages(pages, currentFilter);
  let selectedId = normalizePageId(initialPages.find(page => page.is_start)?.id ?? initialPages[0]?.id);
  let query = '';
  let creating = false;
  let creationNext: 'design' | 'article' | null = null;
  let createdForEditor: string | null = null;
  const slotChecks = new Map<string, Promise<boolean>>();
  const slotWarnings = new Set<string>();
  const slotDesigns = new Map<string, Promise<unknown>>();
  function refreshContentChecks(): void {
    slotChecks.clear(); slotWarnings.clear(); slotDesigns.clear();
    for (const row of tree.querySelectorAll<HTMLElement>('[data-page-id]')) {
      const host = row.querySelector<HTMLElement>('.page-manager__identity-line, .page-manager__form > label');
      if (host) { host.querySelector('.page-manager__slot-warning')?.remove(); checkContentSlot(row.dataset.pageId || '', host); }
    }
  }
  function checkContentSlot(id: string, host: HTMLElement): void {
    if (!id || mainDesignLoading) return;
    let check = slotChecks.get(id);
    if (!check) {
      const loadDesign = (designId: string) => {
        if (!slotDesigns.has(designId)) slotDesigns.set(designId, emitRuntimeAdmin(window.meltdownEmit!, window.ADMIN_TOKEN, 'designer', 'get', { id: designId, includeDrafts: true }));
        return slotDesigns.get(designId)!;
      };
      check = readArticlePage(id).then(page => missingContentSlot(page, pages, mainDesign, loadDesign, readArticlePage));
      slotChecks.set(id, check);
    }
    void check.then(missing => {
      if (slotChecks.get(id) === check && missing) slotWarnings.add(id);
      if (slotChecks.get(id) !== check || !missing || !host.isConnected || host.querySelector('.page-manager__slot-warning')) return;
      const warning = document.createElement('span'); warning.className = 'page-manager__slot-warning'; warning.tabIndex = 0;
      warning.title = `Kein Inhaltsplatz definiert. Im Design einen Container als Page content area markieren. In HTML: ${CONTENT_SLOT_HTML}`;
      warning.setAttribute('aria-label', warning.title); warning.innerHTML = icon('triangle-alert');
      host.append(warning);
    }).catch(error => console.warn('PAGE_CONTENT_SLOT_CHECK_FAILED', error));
  }
  let createParent: string | null = null;
  let creatingCollection = false;
  let dirty = false;
  let busy = false;
  let creationBody: HTMLElement | null = null;
  let refreshPending = false;
  let lastExampleImport: DocsExampleImport['result'] | null = null;
  let focusAfterAction: HTMLElement | null = null;
  let saveDraft = async (): Promise<void> => { throw new Error('PAGE_MANAGER_NO_DRAFT: Select or create a page first.'); };
  const expanded = new Set<string>();

  el.innerHTML = `
    <section class="page-manager" aria-label="Page management">
      <header class="page-manager__header">
        <div><h2>Pages</h2><p>Organize your site, manage page details and open the content editor.</p></div>
        <div class="page-manager__layout-context" aria-label="Applied page layouts"></div>
        <div class="page-manager__header-actions">
          <button type="button" class="button primary sm" data-action="add">${icon('plus')}<span>Add page</span></button>
          <button type="button" class="icon-button" data-action="page-menu" aria-label="More page list actions">${icon('ellipsis-vertical')}</button>
          <button type="button" class="bp-popover__item" data-action="import-example" hidden>Import example</button>
        </div>
      </header>
      <div class="page-manager__feedback" role="status" aria-live="polite"></div>
      <button type="button" class="button secondary sm" data-action="retry" hidden>Refresh pages</button>
      <div class="page-manager__layout">
        <section class="page-manager__structure" aria-label="Site pages">
          <label class="page-manager__search"><span class="bp-sr-only">Search pages</span><input type="search" placeholder="Search pages…" aria-label="Search pages"></label>
          <div class="page-manager__filters" role="group" aria-label="Filter pages"></div>
          <div class="page-manager__tree" role="group" aria-label="Page hierarchy"></div>
        </section>
        <section class="page-manager__details" aria-label="Page details"></section>
      </div>
    </section>`;
  const root = requireElement<HTMLElement>(el, '.page-manager');
  registerWorkspaceChanges(root, { isDirty: () => dirty, isBusy: () => busy });
  const tree = requireElement<HTMLElement>(root, '.page-manager__tree');
  const details = requireElement<HTMLElement>(root, '.page-manager__details');
  const filters = requireElement<HTMLElement>(root, '.page-manager__filters');
  const filterToolbar = document.createElement('div');
  filterToolbar.className = 'page-manager__filter-toolbar';
  filters.before(filterToolbar);
  filterToolbar.append(filters, requireElement(root, '.page-manager__header-actions'));
  const tagFilter = createPageTagFilter(() => renderTree());
  filterToolbar.before(tagFilter.element);
  const feedback = requireElement<HTMLElement>(root, '.page-manager__feedback');
  const retry = requireElement<HTMLButtonElement>(root, '[data-action="retry"]');

  function renderLayoutContext(): void {
    const previewHost = details.querySelector<HTMLElement>('[data-page-design-preview]');
    const subpageAction = previewHost?.querySelector('[data-action="child"]');
    const selectedPage = pages.find(page => normalizePageId(page.id) === selectedId);
    if (previewHost && selectedPage) renderPageDesignPreview(previewHost,
      pagePresentationFromList(selectedPage, pages, mainDesign), designLibrary,
      `/${(window.ADMIN_BASE || 'admin').replace(/^\/+|\/+$/g, '')}`, selectedPage.id, true,
      () => details.querySelector<HTMLButtonElement>('[data-action="delete"]')?.click(), refresh);
    if (subpageAction) previewHost?.querySelector('[aria-label="More page actions"]')?.before(subpageAction);
    const context = requireElement<HTMLElement>(root, '.page-manager__layout-context');
    const active = pages.filter(page => page.status !== 'deleted');
    const assignments = active.map(page => pagePresentationFromList(page, active, mainDesign));
    const inherited = assignments.filter(source => source?.source === 'site').length;
    context.replaceChildren();
    const caption = document.createElement('span');
    caption.textContent = mainDesignLoading ? 'Loading main design…' : mainDesignError ? 'Main design unavailable'
      : mainDesign ? `Main design · ${inherited} of ${active.length} pages` : 'No main design selected';
    context.append(caption);
    if (mainDesign && !mainDesignError) {
      const link = document.createElement('a');
      link.textContent = designLibrary.find(design => String(design.id) === mainDesign)?.title || `Design ${mainDesign}`;
      link.href = `/${(window.ADMIN_BASE || 'admin').replace(/^\/+|\/+$/g, '')}/studio/design/${encodeURIComponent(mainDesign)}`;
      link.title = 'Edit the website main design';
      context.append(link);
    }
    const change = document.createElement('button');
    change.type = 'button'; change.className = 'button text sm';
    change.textContent = mainDesignError ? 'Retry' : mainDesign ? 'Change main design' : 'Choose main design';
    change.disabled = mainDesignLoading;
    change.addEventListener('click', () => void run('PAGE_MAIN_DESIGN_FAILED', mainDesignError ? reloadMainDesign : chooseMainDesign));
    context.append(change);
  }

  async function reloadMainDesign(): Promise<void> {
    mainDesignLoading = true;
    renderLayoutContext();
    try {
      [mainDesign, designLibrary] = await Promise.all([
        loadSiteMainDesign(), fetchPublishedDesigns(window.meltdownEmit, window.ADMIN_TOKEN)
      ]);
      mainDesignError = '';
    } catch (error) {
      mainDesignError = `PAGE_MAIN_DESIGN_LOAD_FAILED: ${errorMessage(error)}`;
      message(mainDesignError, true);
    } finally {
      mainDesignLoading = false; renderLayoutContext();
      // Diagnostics must not rebuild an inline form while the user is typing.
      refreshContentChecks();
    }
  }

  async function applyMainDesign(id: string): Promise<void> {
    await saveSiteMainDesign(id);
    mainDesign = id;
    mainDesignError = '';
    renderLayoutContext();
    refreshContentChecks();
    message('Main design saved. Content pages use it automatically; individual page designs keep their selected mode.');
  }

  async function chooseMainDesign(): Promise<void> {
    const body = document.createElement('div');
    body.className = 'page-manager__form';
    const label = document.createElement('label');
    label.textContent = 'Website main design';
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Website main design');
    select.add(new Option('No main design', ''));
    designLibrary.forEach(design => select.add(new Option(design.title || `Design ${design.id}`, String(design.id))));
    if (mainDesign && !designLibrary.some(design => String(design.id) === mainDesign)) select.add(new Option(`Design ${mainDesign} (unavailable)`, mainDesign));
    select.value = mainDesign;
    label.append(select);
    const hint = document.createElement('p');
    hint.textContent = 'The default frame for content pages. Mark one container as Page content area; each page loads its content or its own design there.';
    body.append(label, hint);
    const result = await bpDialog.open({ title: 'Main design', body, actions: [
      { id: 'cancel', label: 'Cancel', variant: 'ghost' }, { id: 'save', label: 'Save main design', variant: 'primary' }
    ] });
    if (result.action === 'save') await applyMainDesign(select.value);
  }

  function message(text: string, error = false): void {
    feedback.textContent = text;
    feedback.dataset.error = String(error);
    feedback.setAttribute('role', error ? 'alert' : 'status');
    const dialogStatus = creationBody?.querySelector<HTMLElement>('[data-creation-status]');
    if (dialogStatus) dialogStatus.textContent = text;
  }

  function setBusy(value: boolean): void {
    busy = value;
    if (creationBody) details.inert = value || refreshPending;
    root.setAttribute('aria-busy', String(value));
    root.querySelectorAll<HTMLElement>('.page-manager__header, .page-manager__layout').forEach(node => {
      node.inert = value || refreshPending;
    });
    retry.hidden = !refreshPending;
    retry.disabled = value;
  }

  async function canDiscard(): Promise<boolean> {
    return !dirty || bpDialog.confirm('Discard your unsaved page details?', {
      title: 'Unsaved changes', confirmLabel: 'Discard changes'
    });
  }

  async function run(code: string, action: () => Promise<void>, allowRefresh = false, propagate = false): Promise<void> {
    if (busy || (refreshPending && !allowRefresh)) {
      if (propagate) throw new Error('PAGE_MANAGER_RECOVERY_REQUIRED: Refresh the page list before continuing.');
      return;
    }
    setBusy(true);
    try {
      await action();
    } catch (err) {
      message(`${code}: ${errorMessage(err)}`, true);
      if (propagate) throw err;
    } finally {
      setBusy(false);
      if (!creating && creationBody) {
        creationBody.closest('.bp-dialog')?.querySelector<HTMLButtonElement>('.bp-dialog__actions [data-action="cancel"]')?.click();
      }
      // Inputs cannot receive focus while their workspace is inert during an action.
      focusAfterAction?.focus();
      focusAfterAction = null;
    }
  }

  async function refresh(): Promise<void> {
    // A successful write must not be submitted again if only the subsequent read fails.
    // Keep the workspace inert until an explicit refresh recovers the owner's state.
    refreshPending = true;
    const updated = await fetchPages();
    await reloadMainDesign();
    pages.splice(0, pages.length, ...updated);
    if (!pages.some(page => normalizePageId(page.id) === selectedId)) {
      selectedId = normalizePageId(pages[0]?.id);
    }
    refreshPending = false;
    creating = false;
    dirty = false;
    renderTree();
    renderDetails();
    focusAfterAction = details.querySelector('[name="title"]');
  }

  async function afterWrite(success: string): Promise<void> {
    dirty = false;
    try {
      await refresh();
      message(success);
    } catch (err) {
      throw new Error(`PAGE_MANAGER_SAVED_REFRESH_FAILED: Change saved. Refresh pages before continuing. ${errorMessage(err)}`);
    }
  }

  async function importExample(rootSlug: string): Promise<void> {
    const imported = await runDocsExampleImport(rootSlug, false);
    lastExampleImport = imported.result!;
    selectedId = normalizePageId(lastExampleImport.rootPageId);
    query = rootSlug;
    currentFilter = 'All';
    expanded.add(selectedId!);
    root.querySelector<HTMLInputElement>('[type="search"]')!.value = query;
    await afterWrite('Documentation example imported as drafts. Review and publish the shared design, then publish the pages when ready.');
    const link = document.createElement('a');
    link.className = 'button secondary sm'; link.textContent = 'Open example design';
    link.href = `/${(window.ADMIN_BASE || 'admin').replace(/^\/+|\/+$/g, '')}/studio/design/${encodeURIComponent(String(lastExampleImport.designId))}`;
    feedback.append(' ', link);
  }

  async function select(id: string | null): Promise<void> {
    if (!creating && selectedId === id) return;
    if (!(await canDiscard())) return;
    selectedId = id;
    creating = false;
    dirty = false;
    message('');
    renderTree();
    renderDetails();
    // Selecting a row must not enter editing; only a direct field click does that.
    focusAfterAction = null;
  }

  async function add(parent: string | null): Promise<void> {
    if (!(await canDiscard())) return;
    creating = true;
    creationNext = null;
    createdForEditor = null;
    createParent = parent;
    creatingCollection = parent === null && currentFilter === 'Collections';
    dirty = false;
    message('');
    renderTree();
    renderDetails();
    focusAfterAction = details.querySelector<HTMLInputElement>('[name="title"]');
    details.querySelector('[data-action="back"]')?.remove();
    const body = document.createElement('div');
    body.className = 'page-manager page-manager--creation-dialog';
    const status = document.createElement('p');
    status.dataset.creationStatus = '';
    status.setAttribute('role', 'status');
    body.append(details, status);
    creationBody = body;
    const createButton = document.createElement('button');
    createButton.type = 'button';
    createButton.className = 'button primary';
    createButton.textContent = creatingCollection ? 'Create collection' : 'Write article';
    createButton.addEventListener('click', () => { creationNext = creatingCollection ? null : 'article'; details.querySelector<HTMLFormElement>('form')?.requestSubmit(); });
    const footer = document.createElement('div'); footer.className = 'page-manager__create-actions';
    if (!creatingCollection) {
      const design = document.createElement('button'); design.type = 'button'; design.className = 'button secondary'; design.textContent = 'Create design';
      design.addEventListener('click', () => { creationNext = 'design'; details.querySelector<HTMLFormElement>('form')?.requestSubmit(); });
      footer.append(design);
    }
    footer.append(createButton);
    // Keep the same form and save owner; opening must not hold the workspace busy.
    void bpDialog.open({ title: creatingCollection ? 'Add collection' : 'Add page', body,
      dismissable: false, beforeClose: () => !busy,
      actions: [{ id: 'cancel', label: 'Cancel', variant: 'ghost' }], footerContent: footer
    }).then(async () => {
      creationBody = null;
      if (creating) { creating = false; dirty = false; renderTree(); renderDetails(); }
      const id = createdForEditor; const next = creationNext;
      createdForEditor = null; creationNext = null;
      if (!id || !next) return;
      if (next === 'article') await openArticle(id, refresh);
      else {
        const designId = await createPageDesign(await readArticlePage(id));
        window.location.assign(`/${window.ADMIN_BASE || 'admin'}/studio/design/${encodeURIComponent(designId)}`);
      }
    }).catch(error => bpDialog.alert(`PAGE_AUTHORING_OPEN_FAILED: ${errorMessage(error)}`));
  }

  function renderTree(): void {
    filters.innerHTML = ['All', 'Active', 'Drafts', 'Collections', 'Deleted'].map(filter => {
      const label = filter === 'Active' ? 'Published' : filter;
      return `<button class="filter" type="button" data-filter="${filter}" aria-pressed="${filter === currentFilter}">${label}<span>${filterPages(pages, filter).length}</span></button>`;
    }).join('');
    requireElement<HTMLButtonElement>(root, '[data-action="add"]').innerHTML = `${icon('plus')}<span>${currentFilter === 'Collections' ? 'Add collection' : 'Add page'}</span>`;
    tagFilter.refresh(pages);
    const rows = matchingHierarchyRows(pages, currentFilter, query, tagFilter.value() ? [tagFilter.value()] : []);
    const visible = new Set<string>();
    const showMatches = Boolean(query.trim() || tagFilter.value()) || currentFilter !== 'All';
    tree.innerHTML = rows.length ? '' : '<div class="page-manager__empty"><strong>No pages found</strong><p>Try another search or filter, or add your first page.</p></div>';
    for (const row of rows) {
      const id = normalizePageId(row.page.id);
      const hasVisibleChildren = rows.some(candidate => candidate.parentRowId === row.rowId);
      const isExpanded = hasVisibleChildren && (showMatches || expanded.has(row.rowId));
      const hidden = !showMatches && Boolean(row.parentRowId && (!visible.has(row.parentRowId) || !expanded.has(row.parentRowId)));
      if (!hidden) visible.add(row.rowId);
      const element = document.createElement('div');
      element.className = 'page-manager__row';
      element.dataset.pageRowId = row.rowId;
      element.dataset.pageId = id || '';
      element.dataset.depth = String(row.depth);
      element.style.setProperty('--page-depth', String(row.depth));
      element.hidden = hidden;
      element.innerHTML = `
        ${hasVisibleChildren ? `<button type="button" class="page-manager__toggle" aria-label="${isExpanded ? 'Hide' : 'Show'} child pages for ${escapeHtml(row.page.title || 'Untitled')}" aria-expanded="${isExpanded}" ${showMatches ? 'disabled' : ''}>${icon(isExpanded ? 'chevron-down' : 'chevron-right')}</button>` : '<span class="page-manager__toggle-space"></span>'}
        <div class="page-manager__select" role="button" tabindex="0" aria-pressed="${!creating && selectedId === id}">
          <span class="page-manager__page-icon">${icon(row.page.is_start ? 'house' : 'file-text')}</span>
          <span class="page-manager__identity"><span class="page-manager__identity-line"><strong class="page-name">${escapeHtml(row.page.title || 'Untitled')}</strong><button type="button" class="page-manager__status" aria-label="Change page status" aria-haspopup="menu" data-status="${escapeHtml(row.page.status || 'draft')}">${row.page.is_start ? 'Home · ' : ''}${escapeHtml(row.page.status || 'draft')}${icon('chevron-down')}</button></span><span>/${escapeHtml(row.page.slug || '')}</span></span>
        </div>`;
      element.querySelector('button.page-manager__toggle')?.addEventListener('click', () =>
        void run('PAGE_MANAGER_EXPAND_FAILED', () => toggleBranch(row.rowId)));
      checkContentSlot(id || '', element.querySelector<HTMLElement>('.page-manager__identity-line')!);
      element.querySelector('.page-manager__status')?.addEventListener('click', async () => {
        if (busy) return;
        await select(id);
        if (selectedId === id && !creating) details.querySelector<HTMLButtonElement>('.page-manager__status')?.click();
      });
      const activateRow = () => void run('PAGE_MANAGER_SELECT_FAILED', async () => {
        await select(id);
        if (selectedId === id && !creating && hasVisibleChildren && !showMatches) await toggleBranch(row.rowId);
      });
      element.querySelector('.page-manager__select')?.addEventListener('click', event => {
        event.stopPropagation();
        if (!(event.target instanceof Element) || event.target.closest('button, a')) return;
        activateRow();
      });
      element.querySelector('.page-manager__select')?.addEventListener('keydown', event => {
        const key = event as KeyboardEvent;
        if (key.target !== key.currentTarget || !['Enter', ' '].includes(key.key)) return;
        key.preventDefault(); activateRow();
      });
      element.addEventListener('click', event => {
        // Input and action clicks are independent from accordion navigation.
        if (!(event.target instanceof Element) || event.target.closest('button, a, input, select, label, form')) return;
        activateRow();
      });
      if (id && (creating || selectedId !== id)) {
        const hoverActions = document.createElement('div');
        hoverActions.className = 'page-manager__row-actions page-manager__hover-actions';
        // Reuse the selected row's guarded handlers rather than duplicating writes.
        const invoke = async (action: string) => {
          if (busy) return;
          await select(id);
          if (!creating && selectedId === id) details.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)?.click();
        };
        for (const [action, label, symbol] of [['view', 'Open page', 'external-link'], ['share', 'Copy link', 'link'], ['child', 'Add subpage', 'plus'], ['home', 'Set as home page', 'house']]) {
          const button = document.createElement('button');
          button.type = 'button'; button.className = 'icon-button';
          button.setAttribute('aria-label', label!); button.title = label!;
          button.innerHTML = icon(symbol!);
          button.disabled = action === 'home' ? Boolean(row.page.is_start || row.page.status !== 'published')
            : (action === 'view' || action === 'share') && row.page.status !== 'published';
          button.addEventListener('click', () => void invoke(action!));
          if (action === 'view' || action === 'share') {
            const address = element.querySelector('.page-manager__identity > span:last-child')!;
            address.classList.add('page-manager__address-line');
            button.classList.add('page-manager__hover-link');
            address.append(button);
          } else hoverActions.append(button);
        }
        const designActions = document.createElement('div');
        renderPageDesignPreview(designActions, pagePresentationFromList(row.page, pages, mainDesign), designLibrary,
          `/${(window.ADMIN_BASE || 'admin').replace(/^\/+|\/+$/g, '')}`, id, true, () => void invoke('delete'), refresh);
        hoverActions.append(designActions);
        // Keep visual and keyboard order aligned; overflow remains last.
        const overflow = designActions.querySelector('[aria-label="More page actions"]')!;
        overflow.before(hoverActions.querySelector('[aria-label="Add subpage"]')!);
        element.append(hoverActions);
      }
      tree.appendChild(element);
    }
    filters.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(button => {
      button.addEventListener('click', () => {
        currentFilter = button.dataset.filter || 'All';
        renderTree();
        filters.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
      });
    });
    mountDetails();
  }

  async function toggleBranch(rowId: string): Promise<void> {
    const descendants = (): HTMLElement[] => {
      const all = [...tree.querySelectorAll<HTMLElement>('[data-page-row-id]')];
      const index = all.findIndex(row => row.dataset.pageRowId === rowId);
      if (index < 0) return [];
      const depth = Number(all[index]!.dataset.depth);
      const result: HTMLElement[] = [];
      for (const row of all.slice(index + 1)) {
        if (Number(row.dataset.depth) <= depth) break;
        if (!row.hidden) result.push(row);
      }
      return result;
    };
    const opening = !expanded.has(rowId);
    if (opening) { expanded.add(rowId); renderTree(); }
    // Animate only the changing branch and respect the OS motion preference.
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      await Promise.all(descendants().map(async row => {
        if (typeof row.animate !== 'function') return;
        const full = { height: `${row.getBoundingClientRect().height}px`, opacity: 1 };
        const collapsed = { height: '0px', opacity: 0 };
        row.style.overflow = 'hidden';
        try { await row.animate(opening ? [collapsed, full] : [full, collapsed], { duration: 180, easing: 'ease-out' }).finished; }
        catch { /* Navigation may cancel a branch animation. */ }
        finally { row.style.overflow = ''; }
      }));
    }
    if (!opening) { expanded.delete(rowId); renderTree(); }
  }

  // Move the existing draft owner into its row; filtering must not discard its inputs.
  function mountDetails(): void {
    const row = [...tree.querySelectorAll<HTMLElement>('[data-page-id]')]
      .find(element => element.dataset.pageId === selectedId);
    const inline = !creating && Boolean(row);
    details.classList.toggle('is-inline', inline);
    details.hidden = !creating && !row;
    if (inline) row!.append(details);
    else root.querySelector('.page-manager__layout')!.append(details);
  }

  function renderDetails(): void {
    renderLayoutContext();
    const page: PageRecord | undefined = creating
      ? { title: '', slug: '', status: 'draft', lane: 'public', parent_id: createParent }
      : pages.find(candidate => normalizePageId(candidate.id) === selectedId);
    if (!page) {
      saveDraft = async () => { throw new Error('PAGE_MANAGER_NO_DRAFT: Select or create a page first.'); };
      details.innerHTML = '<div class="page-manager__empty"><strong>Your site starts here</strong><p>Add a page to begin, then open the content editor to build it.</p></div>';
      return;
    }
    const parentOptions = getAllowedParentPages(pages, page).map(parent => `<option value="${escapeHtml(parent.id)}" ${normalizePageId(parent.id) === normalizePageId(page.parent_id) ? 'selected' : ''}>${escapeHtml(parent.title || 'Untitled')} — /${escapeHtml(parent.slug || '')}</option>`).join('');
    const adminBase = `/${(window.ADMIN_BASE || 'admin').replace(/^\/+|\/+$/g, '')}`;
    const editorUrl = `${adminBase}/pages/edit/${encodeURIComponent(String(page.id))}`;
    details.innerHTML = `
      <button type="button" class="button text sm page-manager__back" data-action="back">${icon('arrow-left')} Back to pages</button>
      <div class="page-manager__details-heading"><span>${creating ? 'NEW PAGE' : 'PAGE DETAILS'}</span><h3 tabindex="-1">${creating ? (creatingCollection ? 'Add a collection' : 'Add a page') : escapeHtml(page.title || 'Untitled')}</h3></div>
      ${creating ? `<p class="page-manager__hint">${creatingCollection ? 'A collection is a page that groups child pages. Start with a draft, then add subpages.' : 'Start with a draft, then add content in the editor.'}</p>` : `<div class="page-manager__actions"><button type="button" class="icon-button" data-action="view" aria-label="Open page" title="Open page" ${page.status !== 'published' ? 'disabled' : ''}>${icon('external-link')}</button></div>`}
      <form class="page-manager__form">
        <label><span>Title</span><input name="title" required value="${escapeHtml(page.title || '')}" autocomplete="off"></label>
        <label><span>Page address</span><input name="slug" required value="${escapeHtml(page.slug || '')}" placeholder="docs/getting-started" autocomplete="off"><small>Full path after your domain, including any parent path.</small></label>
        <label><span>Parent page</span><select name="parent_id" aria-label="Parent page" data-enhance="dropdown"><option value="">Top level</option>${parentOptions}</select></label>
        <label><span>Status</span><select name="status" aria-label="Status" data-enhance="dropdown"><option value="draft" ${page.status === 'draft' ? 'selected' : ''}>Draft</option><option value="published" ${page.status === 'published' ? 'selected' : ''}>Published</option>${page.status === 'deleted' ? '<option value="deleted" selected>Deleted</option>' : ''}</select></label>
        <div class="page-manager__save"><span class="page-manager__save-state">${creating ? 'Not created yet' : 'Saved'}</span><button class="button primary sm" type="submit" ${creating ? '' : 'disabled'}>${creating ? 'Create page' : 'Save changes'}</button></div>
      </form>
      ${creating ? '<button type="button" class="button text sm" data-action="cancel">Cancel</button>' : `<div class="page-manager__secondary"><button type="button" class="button text sm" data-action="child">${icon('plus')} Add subpage</button><button type="button" class="button text sm" data-action="share" ${page.status !== 'published' ? 'disabled' : ''}>${icon('link')} Copy link</button><button type="button" class="button text sm" data-action="home" ${page.is_start || page.status !== 'published' ? 'disabled' : ''}>${icon('house')} ${page.is_start ? 'Current home page' : 'Set as home page'}</button><button type="button" class="button text sm page-manager__delete" data-action="delete">${icon('trash-2')} Delete page</button></div>`}`;
    if (!creating) {
      const previewHost = document.createElement('div');
      previewHost.dataset.pageDesignPreview = '';
      details.querySelector('.page-manager__details-heading')?.after(previewHost);
      renderPageDesignPreview(previewHost, pagePresentationFromList(page, pages, mainDesign), designLibrary, adminBase, page.id, true,
        () => details.querySelector<HTMLButtonElement>('[data-action="delete"]')?.click(), refresh);
    }
    if (!creating) {
      const inlineForm = requireElement<HTMLFormElement>(details, 'form');
      requireElement<HTMLInputElement>(inlineForm, '[name="title"]').setAttribute('aria-label', 'Title');
      requireElement<HTMLInputElement>(inlineForm, '[name="slug"]').setAttribute('aria-label', 'Page address');
      const toolbar = document.createElement('div');
      toolbar.className = 'page-manager__row-actions';
      toolbar.setAttribute('aria-label', 'Page actions');
      const state = document.createElement('button');
      state.type = 'button';
      state.setAttribute('aria-label', 'Change page status');
      state.setAttribute('aria-haspopup', 'menu');
      state.className = 'page-manager__status';
      state.dataset.status = page.status || 'draft';
      state.textContent = `${page.is_start ? 'Home · ' : ''}${page.status || 'draft'}`;
      state.insertAdjacentHTML('beforeend', icon('chevron-down'));
      state.addEventListener('click', () => {
        if (busy) return;
        const menu = document.createElement('div');
        menu.className = 'bp-popover__menu';
        const popover = openPopover(state, { content: menu, role: 'menu', ariaLabel: 'Page status' });
        for (const value of ['draft', 'published']) {
          const item = document.createElement('button');
          item.type = 'button'; item.className = 'bp-popover__item';
          item.setAttribute('role', 'menuitemradio');
          item.setAttribute('aria-checked', String(value === page.status));
          item.textContent = value === 'draft' ? 'Draft' : 'Published';
          item.addEventListener('click', () => {
            popover.close();
            // Preserve the existing form validation and guarded save path.
            const field = requireElement<HTMLSelectElement>(inlineForm, '[name="status"]');
            field.value = value;
            field.dispatchEvent(new Event('change', { bubbles: true }));
            inlineForm.requestSubmit();
          });
          menu.append(item);
        }
      });
      // Status belongs to the page identity, not its action toolbar.
      inlineForm.querySelector('label')!.append(state);
      checkContentSlot(String(page.id || ''), inlineForm.querySelector('label')!);
      toolbar.append(details.querySelector('[data-page-design-preview]')!);
      for (const button of details.querySelectorAll<HTMLButtonElement>('[data-action="view"], .page-manager__secondary button')) {
        const label = button.getAttribute('aria-label') || button.textContent?.trim() || '';
        button.setAttribute('aria-label', label);
        button.title = label;
        button.className = 'icon-button';
        if (button.dataset.action === 'delete') button.hidden = true;
        for (const node of [...button.childNodes]) if (node.nodeType === Node.TEXT_NODE) node.remove();
        if (button.dataset.action === 'view' || button.dataset.action === 'share') {
          inlineForm.querySelectorAll('label')[1]!.append(button);
        } else toolbar.append(button);
      }
      details.replaceChildren(inlineForm, toolbar);
      const pageIcon = document.createElement('span');
      pageIcon.className = 'page-manager__page-icon';
      pageIcon.innerHTML = icon(page.is_start ? 'house' : 'file-text');
      details.prepend(pageIcon);
      toolbar.append(toolbar.querySelector('[data-page-design-preview]')!);
      toolbar.querySelector('[aria-label="More page actions"]')!.before(toolbar.querySelector('[data-action="child"]')!);
      const save = requireElement<HTMLButtonElement>(inlineForm, '[type="submit"]');
      save.className = 'icon-button';
      save.title = 'Save changes (Enter)';
      save.setAttribute('aria-label', 'Save changes');
      save.innerHTML = icon('check');
      inlineForm.addEventListener('keydown', event => {
        if (!(event.target instanceof HTMLInputElement) || event.isComposing) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          inlineForm.reset();
          dirty = false;
          requireElement<HTMLElement>(inlineForm, '.page-manager__save-state').textContent = 'Saved';
          requireElement<HTMLButtonElement>(inlineForm, '[type="submit"]').disabled = true;
          event.target.blur();
        } else if (event.key === 'Enter') {
          event.preventDefault();
          if (dirty) inlineForm.requestSubmit();
        }
      });
    }
    mountDetails();
    enhanceSelects(details);
    const form = requireElement<HTMLFormElement>(details, 'form');
    let slugEdited = false;
    form.addEventListener('input', event => {
      const target = event.target as HTMLInputElement;
      if (target.name === 'slug') slugEdited = true;
      if (creating && target.name === 'title' && !slugEdited) {
        const parent = pages.find(candidate => normalizePageId(candidate.id) === createParent);
        const prefix = parent?.slug ? `${parent.slug}/` : '';
        requireElement<HTMLInputElement>(form, '[name="slug"]').value = prefix + sanitizeSlug(target.value.replace(/\s+/g, '-'));
      }
      markDirty();
    });
    form.addEventListener('change', markDirty);
    function markDirty(): void {
      dirty = true;
      requireElement<HTMLElement>(form, '.page-manager__save-state').textContent = 'Unsaved changes';
      requireElement<HTMLButtonElement>(form, '[type="submit"]').disabled = false;
    }
    // One save handler serves the form and the structured agent command.
    saveDraft = async () => {
        const data = new FormData(form);
        const title = String(data.get('title') || '').trim();
        const rawSlug = String(data.get('slug') || '').trim();
        const slug = sanitizeSlug(rawSlug);
        if (!title || !slug) throw new Error('PAGE_MANAGER_REQUIRED: Enter a title and page address.');
        if (slug !== rawSlug.replace(/^\/+/, '')) throw new Error('PAGE_MANAGER_SLUG_INVALID: Use lowercase letters, numbers, hyphens and slashes in the page address.');
        const parent_id = normalizePageId(data.get('parent_id'));
        const parentError = getParentValidationError(pages, page, parent_id);
        if (parentError) throw new Error(`PAGE_MANAGER_PARENT_INVALID: ${parentError}`);
        if (pages.some(candidate => normalizePageId(candidate.id) !== normalizePageId(page.id) && candidate.slug === slug)) {
          throw new Error('PAGES_SLUG_DUPLICATE: This page address is already in use.');
        }
        const status = String(data.get('status') || 'draft');
        if (creating) {
          const result = await pageService.create({ title, slug, status, parent_id,
            ...(creatingCollection ? { meta: { isCollection: true } } : {})
          }) as { pageId?: string | number };
          selectedId = normalizePageId(result?.pageId);
          createdForEditor = selectedId;
        } else {
          await pageService.update(page, { title, slug, parent_id, status });
        }
        await afterWrite(creating ? 'Page created.' : 'Page details saved.');
    };
    form.addEventListener('submit', event => {
      event.preventDefault();
      event.stopPropagation(); // Do not submit the enclosing shared dialog form.
      void run('PAGE_MANAGER_SAVE_FAILED', saveDraft);
    });
    const bind = (action: string, handler: () => Promise<void>) => {
      details.querySelector(`[data-action="${action}"]`)?.addEventListener('click', () => void run(`PAGE_MANAGER_${action.toUpperCase()}_FAILED`, handler));
    };
    bind('cancel', () => select(selectedId));
    bind('back', async () => {
      focusAfterAction = root.querySelector<HTMLInputElement>('[type="search"]');
    });
    bind('child', () => add(selectedId));
    bind('view', async () => { window.open(`/${page.slug || ''}`, '_blank', 'noopener'); });
    bind('share', async () => {
      await navigator.clipboard.writeText(`${window.location.origin}/${page.slug || ''}`);
      message('Page link copied.');
    });
    bind('home', async () => {
      if (!(await canDiscard())) return;
      if (!(await bpDialog.confirm(`Set “${page.title || 'Untitled'}” as the home page?`, {
        title: 'Set home page', confirmLabel: 'Set as home page'
      }))) return;
      await pageService.setAsStart(page.id ?? '');
      await afterWrite('Home page updated.');
    });
    bind('delete', async () => {
      if (!(await bpDialog.confirm(`Delete “${page.title || 'Untitled'}”?${dirty ? ' Unsaved details will also be discarded.' : ''}`, { title: 'Delete page', confirmLabel: 'Delete page' }))) return;
      await pageService.delete(page.id ?? '');
      await afterWrite('Page deleted.');
    });
  }

  root.querySelector('[data-action="add"]')?.addEventListener('click', () => void run('PAGE_MANAGER_CREATE_FAILED', () => add(null)));
  const importButton = requireElement<HTMLButtonElement>(root, '[data-action="import-example"]');
  const menuButton = requireElement<HTMLButtonElement>(root, '[data-action="page-menu"]');
  menuButton.addEventListener('click', () => {
    const menu = document.createElement('div');
    menu.className = 'bp-popover__menu';
    importButton.hidden = false;
    menu.append(importButton);
    openPopover(menuButton, { content: menu, role: 'menu', ariaLabel: 'Page list actions', placement: 'bottom-end' });
  });
  root.querySelector('[data-action="import-example"]')?.addEventListener('click', () => void run('EXAMPLE_IMPORT_FAILED', async () => {
    if (!(await canDiscard())) return;
    const rootSlug = await promptDocsExampleImport();
    if (rootSlug !== null) await importExample(rootSlug.trim());
  }));
  root.querySelector<HTMLInputElement>('[type="search"]')?.addEventListener('input', event => {
    query = (event.target as HTMLInputElement).value;
    renderTree();
  });
  retry.addEventListener('click', () => void run('PAGE_MANAGER_REFRESH_FAILED', async () => {
    await refresh();
    message('Pages refreshed.');
  }, true));
  renderTree();
  renderDetails();
  void reloadMainDesign();
  const editableFields = ['title', 'slug', 'parent_id', 'status'];
  registerWorkspaceAgent({ root, id: 'pages', title: 'Pages',
    read: () => ({ dirty, busy, error: feedback.dataset.error === 'true' ? feedback.textContent : null,
      selection: selectedId, creating, refreshPending, filter: currentFilter, query, tag: tagFilter.value(), lastExampleImport,
      contentSlotWarnings: [...slotWarnings].map(id => ({ pageId: id, code: 'PAGE_CONTENT_SLOT_MISSING' })),
      mainDesign: { id: mainDesign || null, loading: mainDesignLoading, error: mainDesignError || null,
        designs: designLibrary.map(({ id, title }) => ({ id, title })) },
      presentation: pages.find(page => normalizePageId(page.id) === selectedId)
        ? pagePresentationFromList(pages.find(page => normalizePageId(page.id) === selectedId)!, pages, mainDesign) : null,
      draft: readAgentForm(details, editableFields),
      pageCount: pages.length,
      pages: matchingHierarchyRows(pages, currentFilter, query, tagFilter.value() ? [tagFilter.value()] : []).map(({ page }) => ({ id: page.id, title: page.title, slug: page.slug, status: page.status, parent_id: page.parent_id, is_start: page.is_start, tags: pageTags(page) }))
    }),
    actions: [
      { action: 'pages.filterTag', label: 'Filter pages by tag', params: [{ name: 'tag', type: 'string', required: true }],
        run: p => { tagFilter.set(p.tag); renderTree(); } },
      { action: 'pages.openArticle', label: 'Open article editor', params: [{ name: 'id', type: 'string', required: true }], run: async p => {
        const id = agentString(p, 'id');
        if (!pages.some(page => normalizePageId(page.id) === id)) throw new Error('PAGE_MANAGER_PAGE_NOT_FOUND');
        const page = await readArticlePage(id);
        if (!['empty', 'article'].includes(pageContentKind(page))) throw new Error('ARTICLE_FORMAT_CONFLICT');
        // The modal owns a separate existing AgentManager surface; do not keep
        // the list command pending until that surface is closed.
        void openArticle(id).catch(error => bpDialog.alert(error instanceof Error ? error.message : 'ARTICLE_EDITOR_OPEN_FAILED'));
        return { opening: true, workspaceId: `article-${id}` };
      } },
      { action: 'pages.previewExample', label: 'Check documentation example import', readOnly: true,
        params: [{ name: 'rootSlug', type: 'string', required: true }],
        run: p => runDocsExampleImport(agentString(p, 'rootSlug'), true) },
      { action: 'pages.importExample', label: 'Import documentation example as drafts', confirm: true,
        params: [{ name: 'rootSlug', type: 'string', required: true }],
        run: p => run('EXAMPLE_IMPORT_FAILED', () => importExample(agentString(p, 'rootSlug')), false, true) },
      { action: 'pages.setMainDesign', label: 'Set website main design', confirm: true,
        params: [{ name: 'designId', type: 'string', required: true }], run: p => {
          if (typeof p.designId !== 'string') throw new Error('PAGE_MAIN_DESIGN_INVALID');
          return run('PAGE_MAIN_DESIGN_SAVE_FAILED', () => applyMainDesign(p.designId as string), false, true);
        } },
      { action: 'pages.select', label: 'Select page', params: [{ name: 'id', type: 'string', required: true }], run: async p => {
        const id = agentString(p, 'id');
        if (!pages.some(page => normalizePageId(page.id) === id)) throw new Error('PAGE_MANAGER_PAGE_NOT_FOUND');
        await select(id);
      } },
      { action: 'pages.search', label: 'Search pages', acceptsDraft: true, params: [{ name: 'query', type: 'string', required: true }], run: p => {
        if (typeof p.query !== 'string') throw new Error('CMS_AGENT_PARAM_INVALID: query must be a string.');
        query = p.query;
        root.querySelector<HTMLInputElement>('[type="search"]')!.value = query;
        renderTree();
      } },
      { action: 'pages.createDraft', label: 'Start a page draft', params: [{ name: 'parentId', type: 'string', required: false }], run: async p => {
        const parent = p.parentId == null ? null : agentString(p, 'parentId');
        if (parent && !pages.some(page => normalizePageId(page.id) === parent && page.status !== 'deleted')) throw new Error('PAGE_MANAGER_PARENT_INVALID');
        await add(parent);
      } },
      { action: 'pages.updateDraft', label: 'Update page details', acceptsDraft: true,
        params: [{ name: 'fields', type: 'object', required: true }],
        run: p => patchAgentForm(details, p.fields, editableFields) },
      { action: 'pages.save', label: 'Save page details', acceptsDraft: true, confirm: true,
        run: () => run('PAGE_MANAGER_SAVE_FAILED', saveDraft, false, true) },
      { action: 'pages.refresh', label: 'Reload pages', run: () => run('PAGE_MANAGER_REFRESH_FAILED', refresh, true, true) }
    ]
  });
}
