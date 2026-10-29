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
  confirm: jest.fn().mockResolvedValue(false), alert: jest.fn(), prompt: jest.fn(),
  open: jest.fn(options => {
    document.getElementById('content')!.append(options.body);
    return new Promise(() => {});
  })
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
      if (payload.resource === 'importers' && action === 'run') {
        const rootSlug = params.options.rootSlug;
        const imported = { id: 8, title: 'Introduction', slug: rootSlug, status: 'draft', parent_id: null };
        if (!params.options.dryRun) pages.push(imported);
        return { dryRun: params.options.dryRun, plan: { rootSlug, pages: [imported], summary: 'Draft example' },
          result: { rootPageId: 8, designId: 9, pageIds: [8], menuKey: `example-${rootSlug}` } };
      }
      if (payload.resource === 'settings' && action === 'public') return { SITE_MAIN_DESIGN_ID: 'main' };
      if (payload.resource === 'designer' && action === 'list') return { designs: [{ id: 'main', title: 'Website frame' }] };
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
    await settle();
  });

  it('composes page counts, the hierarchy and one saved details form', () => {
    expect(control<HTMLAnchorElement>('[aria-label="Site settings"]').getAttribute('href')).toBe('/admin/pages/edit/1');
    expect(control('.page-manager')).not.toBeNull();
    expect(control('.page-manager__filters').textContent).toContain('Published3');
    expect(host.querySelectorAll('form')).toHaveLength(1);
    expect(control<HTMLInputElement>('[name="title"]').value).toBe('Docs');
    expect(control('[type="submit"]').disabled).toBe(true);
    expect(host.querySelector('[contenteditable]')).toBeNull();
  });

  it('changes status through the shared popover and existing save action', async () => {
    await click('.page-manager__details .page-manager__status');
    const item = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')].find(b => b.textContent === 'Draft')!;
    expect(item).toBeTruthy();
    item.click();
    await settle();
    expect(calls('update').at(-1)?.[1].params.status).toBe('draft');
  });

  it('edits within the selected row, saves with Enter and cancels with Escape', async () => {
    expect(control('.page-manager__form label .page-manager__status').textContent).toContain('published');
    expect(control('[data-action="share"]').parentElement).toBe(control('[name="slug"]').parentElement);
    expect(control('[data-action="view"]').parentElement).toBe(control('[name="slug"]').parentElement);
    expect(control('.page-manager__details').parentElement?.dataset.pageId).toBe('1');
    edit('title', 'Updated docs');
    control('[name="title"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(calls('update')).toHaveLength(1);
    expect(pages[0].title).toBe('Updated docs');
    edit('title', 'Discard me');
    control('[name="title"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(control<HTMLInputElement>('[name="title"]').value).toBe('Updated docs');
    expect(control<HTMLButtonElement>('[type="submit"]').disabled).toBe(true);
    expect(calls('update')).toHaveLength(1);
    expect(control('[aria-label="Site settings"]').textContent).toBe('');
  });

  it('imports the optional example, selects its draft and opens its shared design from the result', async () => {
    jest.mocked(bpDialog.prompt).mockResolvedValueOnce('learn');
    await click('[data-action="import-example"]');
    expect(calls('run')[0][1]).toMatchObject({ resource: 'importers', params: {
      importerName: 'exampleSite', options: { exampleId: 'docs', rootSlug: 'learn', dryRun: false }
    } });
    expect(control<HTMLInputElement>('[name="title"]').value).toBe('Introduction');
    expect(host.textContent).toContain('Open example design');
    expect(host.querySelector('a[href="/admin/studio/design/9"]')).not.toBeNull();
  });

  it('lets agents preview without writes and requires the shared confirmation for importing', async () => {
    const registration = jest.mocked(registerWorkspaceAgent).mock;
    const guard = registration.results[registration.results.length - 1].value;
    const actions = registration.calls[registration.calls.length - 1][0].actions;
    await guard.execute({ action: 'pages.previewExample', params: { rootSlug: 'learn' } }, actions);
    expect(calls('run')[0][1].params.options.dryRun).toBe(true);
    expect(pages).toHaveLength(4);
    await expect(guard.execute({ action: 'pages.importExample', params: {
      rootSlug: 'learn', expectedRevision: guard.snapshot().stateRevision
    } }, actions)).rejects.toThrow(/CONFIRM/);
    expect(pages).toHaveLength(4);
    guard.stop();
  });

  it('shows the website main design and counts pages using it independently of their hierarchy', async () => {
    pages[0].meta = { designId: 'docs', designTitle: 'Documentation layout' };
    pages[3].parent_id = 1;
    renderPageList(host, pages);
    await settle();
    expect(control('.page-manager__layout-context').textContent).toContain('Main design · 3 of 4 pages');
    expect(control('.page-manager__layout-context a').getAttribute('href')).toContain('/studio/design/main');
    pages[3].meta = { inheritParentDesign: false };
    renderPageList(host, pages);
    await settle();
    expect(control('.page-manager__layout-context').textContent).toContain('Main design · 2 of 4 pages');
  });

  it('sets the main design through the existing settings action and shared agent guard', async () => {
    const registration = jest.mocked(registerWorkspaceAgent).mock;
    const guard = registration.results[registration.results.length - 1].value;
    const actions = registration.calls[registration.calls.length - 1][0].actions;
    await guard.execute({ action: 'pages.setMainDesign', params: {
      expectedRevision: guard.snapshot().stateRevision, confirm: true, designId: 'new-main'
    } }, actions);
    expect(calls('set')[0][1]).toMatchObject({ resource: 'settings', params: { key: 'SITE_MAIN_DESIGN_ID', value: 'new-main' } });
    expect(control('.page-manager__layout-context a').getAttribute('href')).toContain('/studio/design/new-main');
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
    expect(bpDialog.open).toHaveBeenCalledWith(expect.objectContaining({ title: 'Add page', dismissable: false }));
    expect(document.querySelector('.page-manager--creation-dialog h3')?.textContent).toBe('Add a page');
    expect(document.activeElement?.getAttribute('name')).toBe('title');
    expect(bpDialog.prompt).not.toHaveBeenCalled();
  });

  it('selects a row without focusing an editable field', async () => {
    await click('[data-page-row-id="page-list-4-3"] .page-manager__select');
    expect(document.activeElement).not.toBe(control('[name="title"]'));
    expect(host.querySelector('.page-manager__identity-line .page-manager__status')).not.toBeNull();
    expect(host.querySelector('.page-manager__hover-actions [aria-label="Site settings"]')).not.toBeNull();
    expect(host.querySelector('.page-manager__hover-actions [aria-label="More page actions"]')?.previousElementSibling?.getAttribute('aria-label')).toBe('Add subpage');
    expect(host.querySelector('.page-manager__details [aria-label="More page actions"]')?.previousElementSibling?.getAttribute('data-action')).toBe('child');
  });
  it('toggles a branch from its row without entering title editing', async () => {
    const child = () => control<HTMLElement>('[data-page-id="2"]');
    expect(child().hidden).toBe(true);
    control<HTMLElement>('[data-page-id="1"] .page-manager__details').click();
    await settle();
    expect(child().hidden).toBe(false);
    expect(document.activeElement).not.toBe(control('[name="title"]'));
    control<HTMLElement>('[data-page-id="1"] .page-manager__details').click();
    await settle();
    expect(child().hidden).toBe(true);
  });

  it('requires the global confirmation for home changes and deletion', async () => {
    await click('[data-page-row-id="page-list-4-3"] .page-manager__select');
    await click('[data-action="home"]');
    expect(bpDialog.confirm).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ title: 'Set home page' }));
    expect(calls('setStart')).toHaveLength(0);
    await click('[data-action="delete"]');
    expect(bpDialog.confirm).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ title: 'Delete page' }));
    expect(calls('delete')).toHaveLength(0);
  });
});
