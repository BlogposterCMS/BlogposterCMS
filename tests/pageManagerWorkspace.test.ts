/** @jest-environment jsdom */
import { render, renderPageList, matchingHierarchyRows } from '../ui/widgets/plainspace/admin/defaultwidgets/pageList/pageList';
import { bpDialog } from '../ui/shared/dialogs/bpDialog';
import { createNewPage } from '../ui/shell/dashboard/pageActions';
import { registerWorkspaceAgent } from '../ui/shared/agent/workspaceAgent';

jest.mock('../ui/shared/agent/workspaceAgent', () => {
  const actual = jest.requireActual('../ui/shared/agent/workspaceAgent');
  return { ...actual, registerWorkspaceAgent: jest.fn(actual.registerWorkspaceAgent) };
});

jest.mock('../ui/shared/dialogs/bpDialog', () => ({ bpDialog: {
  confirm: jest.fn().mockResolvedValue(false), alert: jest.fn(), prompt: jest.fn()
} }));
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('Page Manager workspace', () => {
  let host: HTMLElement;
  let pages: any[];
  let emit: jest.Mock;
  let fail: string;
  const control = <T extends HTMLElement = HTMLButtonElement>(selector: string) => host.querySelector<T>(selector)!;
  const edit = (name: string, value: string) => {
    const field = control<HTMLInputElement>(`[name="${name}"]`);
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const click = async (selector: string) => { control(selector).click(); await settle(); };
  const submit = async () => { control('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settle(); };
  const calls = (action: string) => emit.mock.calls.filter(([, payload]) => payload.action === action);

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.mocked(bpDialog.confirm).mockResolvedValue(false);
    fail = '';
    pages = [
      { id: 1, title: 'Docs', slug: 'docs', status: 'published', parent_id: null, is_start: true },
      { id: 2, title: 'Mobile', slug: 'docs/mobile', status: 'draft', parent_id: 1 },
      { id: 3, title: 'Scanner', slug: 'docs/mobile/scanner', status: 'published', parent_id: 2 },
      { id: 4, title: 'Download', slug: 'download', status: 'published', parent_id: null }
    ];
    emit = jest.fn(async (_event, payload) => {
      if (payload.action === fail) throw new Error('offline');
      const { action, params } = payload;
      if (action === 'byLane') return { resource: 'pages', action, data: JSON.parse(JSON.stringify(pages)) };
      if (action === 'update') Object.assign(pages.find(page => page.id === params.pageId), params);
      if (action === 'create') { pages.push({ ...params, id: 5 }); return { pageId: 5 }; }
      return { ok: true };
    });
    window.meltdownEmit = emit;
    host = document.createElement('main');
    host.id = 'content';
    document.body.replaceChildren(host);
    await render(host);
  });

  it('composes page counts, the hierarchy and one saved details form', () => {
    expect(control<HTMLAnchorElement>('[data-action="edit"]').getAttribute('href')).toBe('/admin/pages/edit/1');
    expect(control('.page-manager')).not.toBeNull();
    expect(control('.page-manager__filters').textContent).toContain('Published3');
    expect(host.querySelectorAll('form')).toHaveLength(1);
    expect(control<HTMLInputElement>('[name="title"]').value).toBe('Docs');
    expect(control('[type="submit"]').disabled).toBe(true);
    expect(host.querySelector('[contenteditable]')).toBeNull();
  });

  it('shares agent edits and saves with the visible form, rejecting stale commands and retaining failed drafts', async () => {
    const registration = jest.mocked(registerWorkspaceAgent).mock;
    const guard = registration.results[registration.results.length - 1].value;
    const actions = registration.calls[registration.calls.length - 1][0].actions;
    const before = guard.snapshot();
    edit('title', 'Human draft');
    await expect(guard.execute({ action: 'pages.updateDraft', params: {
      expectedRevision: before.stateRevision, fields: { title: 'Agent draft' }
    } }, actions)).rejects.toThrow('CMS_AGENT_STATE_CHANGED');
    await guard.execute({ action: 'pages.updateDraft', params: {
      expectedRevision: guard.snapshot().stateRevision, acceptDraft: true, fields: { title: 'Reviewed draft' }
    } }, actions);
    expect(control<HTMLInputElement>('[name="title"]').value).toBe('Reviewed draft');
    expect(calls('update')).toHaveLength(0);
    fail = 'update';
    await expect(guard.execute({ action: 'pages.save', params: {
      expectedRevision: guard.snapshot().stateRevision, acceptDraft: true, confirm: true
    } }, actions)).rejects.toThrow('offline');
    expect(guard.snapshot()).toMatchObject({ dirty: true, busy: false, draft: { title: 'Reviewed draft' } });
    fail = '';
    await guard.execute({ action: 'pages.save', params: {
      expectedRevision: guard.snapshot().stateRevision, acceptDraft: true, confirm: true
    } }, actions);
    expect(pages[0].title).toBe('Reviewed draft');
    expect(guard.snapshot().dirty).toBe(false);
    guard.stop();
  });

  it('keeps deleted pages in their own filter rather than the default working list', () => {
    const deleted = { id: 9, title: 'Trashed', status: 'deleted', parent_id: null };
    expect(matchingHierarchyRows([...pages, deleted], 'All', '').some(row => row.page.id === 9)).toBe(false);
    expect(matchingHierarchyRows([...pages, deleted], 'Deleted', '').map(row => row.page.id)).toEqual([9]);
  });

  it('keeps the ancestors of matching nested pages visible', () => {
    const input = control<HTMLInputElement>('[type="search"]');
    input.value = 'scanner';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(Array.from(host.querySelectorAll('.page-name')).map(node => node.textContent)).toEqual(['Docs', 'Mobile', 'Scanner']);
    expect(host.querySelectorAll('.page-manager__row[hidden]')).toHaveLength(0);
    expect(matchingHierarchyRows(pages, 'Drafts', '')).toHaveLength(2);
  });

  it('shows collections and their child pages in the existing hierarchy', async () => {
    await click('[data-filter="Collections"]');
    expect(Array.from(host.querySelectorAll('.page-name')).map(node => node.textContent)).toEqual(['Docs', 'Mobile', 'Scanner']);
    expect(control('[data-action="add"]').textContent).toContain('Add collection');
    await click('[data-action="add"]');
    edit('title', 'Knowledge base');
    await submit();
    expect(calls('create')[0][1].params).toMatchObject({ title: 'Knowledge base', status: 'draft', meta: { isCollection: true } });
    expect(control('[data-filter="Collections"]').textContent).toContain('3');
    // Explicit collection metadata survives the normal details save contract.
    edit('title', 'Knowledge');
    await submit();
    expect(calls('update')[0][1].params.meta).toEqual({ isCollection: true });
  });

  it('keeps form edits when search or filters change, and writes all fields once', async () => {
    edit('title', 'Documentation');
    edit('slug', 'documentation');
    edit('status', 'draft');
    await click('[data-filter="Drafts"]');
    expect(control<HTMLInputElement>('[name="title"]').value).toBe('Documentation');
    expect(calls('update')).toHaveLength(0);
    await submit();
    expect(calls('update')).toHaveLength(1);
    expect(calls('update')[0][1].params).toMatchObject({ pageId: 1, title: 'Documentation', slug: 'documentation', parent_id: null, status: 'draft' });
    expect(control('.page-manager__save-state').textContent).toBe('Saved');
  });

  it('keeps a draft on cancelled selection and discards only on acceptance', async () => {
    edit('title', 'Unsaved');
    await click('[data-page-row-id="page-list-4-3"] .page-manager__select');
    expect(control<HTMLInputElement>('[name="title"]').value).toBe('Unsaved');
    jest.mocked(bpDialog.confirm).mockResolvedValue(true);
    await click('[data-page-row-id="page-list-4-3"] .page-manager__select');
    expect(control<HTMLInputElement>('[name="title"]').value).toBe('Download');
  });

  it('keeps failed saves editable without claiming success', async () => {
    edit('title', 'Unsaved');
    fail = 'update';
    await submit();
    expect(control<HTMLInputElement>('[name="title"]').value).toBe('Unsaved');
    expect(control('[role="alert"]').textContent).toContain('PAGE_MANAGER_SAVE_FAILED');
    expect(control('[type="submit"]').disabled).toBe(false);
  });

  it('creates a draft subpage with an explicit parent through the existing pages action', async () => {
    await click('[data-action="child"]');
    edit('title', 'Getting started');
    expect(control<HTMLInputElement>('[name="slug"]').value).toBe('docs/getting-started');
    await submit();
    expect(calls('create')).toHaveLength(1);
    expect(calls('create')[0][1]).toMatchObject({ resource: 'pages', params: { parent_id: '1', status: 'draft', slug: 'docs/getting-started', title: 'Getting started' } });
    expect(control<HTMLInputElement>('[name="title"]').value).toBe('Getting started');
    expect(control('[data-action="view"]').disabled).toBe(true);
  });

  it('recovers after an acknowledged create followed by a failed refresh without recreating', async () => {
    await click('[data-action="add"]');
    edit('title', 'New page');
    fail = 'byLane';
    await submit();
    expect(control('[role="alert"]').textContent).toContain('PAGE_MANAGER_SAVED_REFRESH_FAILED');
    expect(control('.page-manager__layout').inert).toBe(true);
    expect(control('[data-action="retry"]').hidden).toBe(false);
    await submit();
    expect(calls('create')).toHaveLength(1);
    fail = '';
    await click('[data-action="retry"]');
    expect(calls('create')).toHaveLength(1);
    expect(control<HTMLInputElement>('[name="title"]').value).toBe('New page');
    expect(control('.page-manager__layout').inert).toBe(false);
  });

  it('blocks duplicate addresses and does not silently rewrite invalid addresses', async () => {
    edit('slug', 'download');
    await submit();
    expect(control('[role="alert"]').textContent).toContain('PAGES_SLUG_DUPLICATE');
    edit('slug', 'Docs Help');
    await submit();
    expect(control('[role="alert"]').textContent).toContain('PAGE_MANAGER_SLUG_INVALID');
    expect(calls('update')).toHaveLength(0);
  });

  it('excludes descendants from the parent picker and keeps corrupt cycles reachable', () => {
    expect(Array.from(host.querySelectorAll<HTMLSelectElement>('select[name="parent_id"] option')).map(node => node.value)).toEqual(['', '4']);
    renderPageList(host, [{ id: 1, title: 'A', parent_id: 2 }, { id: 2, title: 'B', parent_id: 1 }]);
    expect(host.querySelectorAll('.page-manager__row:not([hidden])')).toHaveLength(1);
  });

  it('exposes a retry after an initial load failure', async () => {
    fail = 'byLane';
    await render(host);
    expect(control('[role="alert"]').textContent).toContain('PAGE_MANAGER_LOAD_FAILED');
    fail = '';
    await click('button');
    expect(control('.page-manager')).not.toBeNull();
  });

  it('routes the shell create shortcut into the same workspace form', async () => {
    host.dataset.dashboardLayout = 'fixed';
    await createNewPage();
    await settle();
    expect(control('h3').textContent).toBe('Add a page');
    expect(bpDialog.prompt).not.toHaveBeenCalled();
    expect(calls('create')).toHaveLength(0);
  });

  it('routes creation through the real widget shadow boundary', async () => {
    host.dataset.dashboardLayout = 'fixed';
    host.innerHTML = '<article data-widget-id="pageList"><div class="canvas-item-content"></div></article>';
    const root = control('.canvas-item-content').attachShadow({ mode: 'open' });
    const target = document.createElement('div');
    root.appendChild(target);
    renderPageList(target, pages);
    await createNewPage();
    await settle();
    expect(root.querySelector('h3')?.textContent).toBe('Add a page');
    expect(root.activeElement?.getAttribute('name')).toBe('title');
    expect(bpDialog.prompt).not.toHaveBeenCalled();
  });

  it('moves focus to selected details and offers a return to the page search', async () => {
    await click('[data-page-row-id="page-list-4-3"] .page-manager__select');
    expect(document.activeElement).toBe(control('h3'));
    await click('[data-action="back"]');
    expect(document.activeElement).toBe(control('[type="search"]'));
  });
});
