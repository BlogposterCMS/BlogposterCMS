/** @jest-environment jsdom */
import { render } from '../ui/widgets/plainspace/admin/navigationStudioWidget';
import { bpDialog } from '../ui/shared/dialogs/bpDialog';
import { NAVIGATION_STUDIO_DEFAULT_LOCATIONS, NAVIGATION_STUDIO_DEFAULT_MENUS } from '../ui/widgets/plainspace/admin/navigationStudioData';

jest.mock('../ui/shared/dialogs/bpDialog', () => ({
  bpDialog: { confirm: jest.fn().mockResolvedValue(false), prompt: jest.fn().mockResolvedValue(null) }
}));

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('Navigation Studio editing flows', () => {
  let host: HTMLElement;
  let emit: jest.Mock;
  let trees: Record<string, any[]>;
  let rejectAction: string;
  let rejectTree: string;

  function control<T extends HTMLElement = HTMLButtonElement>(selector: string): T {
    return host.querySelector<T>(selector)!;
  }
  function edit(name: string, value: string) {
    const input = control<HTMLInputElement>(`[name="${name}"]`);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  async function click(selector: string) {
    control(selector).click();
    await settle();
  }
  function calls(action: string) {
    return emit.mock.calls.filter(([, payload]) => payload.action === action);
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.mocked(bpDialog.confirm).mockResolvedValue(false);
    rejectAction = '';
    rejectTree = '';
    trees = {
      'header-main': [
        { id: 'a', title: 'Home', type: 'page', url: '/old', sourceId: 'p1', sourceModule: 'pagesManager', status: 'active', rel: 'nofollow', children: [
          { id: 'child', title: 'Child', type: 'custom', url: '/child', status: 'active' }
        ] },
        { id: 'b', title: 'Docs', type: 'custom', url: '/docs', status: 'active' },
        { id: 'draft', title: 'Private draft', url: '/draft', status: 'draft' }
      ],
      'footer-menu': []
    };
    emit = jest.fn(async (_event, payload) => {
      const { resource, action, params } = payload;
      if (action === rejectAction) throw new Error('offline');
      if (resource === 'navigation') {
        if (action === 'locations') return NAVIGATION_STUDIO_DEFAULT_LOCATIONS;
        if (action === 'menus') return NAVIGATION_STUDIO_DEFAULT_MENUS;
        if (action === 'tree') {
          if (params.menuKey === rejectTree) throw new Error('menu offline');
          return { tree: JSON.parse(JSON.stringify(trees[params.menuKey] || [])) };
        }
        if (action === 'addItem') return { ...params, id: 'new-link' };
        if (action === 'updateItem') return { ...params, id: params.itemId };
      }
      if (resource === 'pages') return [{ id: 'p1', title: 'Home', slug: 'home', status: 'published' }, { id: 'p2', title: 'Documentation', slug: 'docs', status: 'published' }];
      return [];
    });
    window.meltdownEmit = emit;
    host = document.createElement('div');
    document.body.replaceChildren(host);
    await render(host);
  });

  it('starts with the primary menu, a closed picker and link details before preview', () => {
    expect(control<HTMLSelectElement>('[data-menu-select]').value).toBe('header-main');
    expect(control('[data-add-panel]').hidden).toBe(true);
    const side = control('.navigation-studio__side');
    expect(side.firstElementChild?.classList.contains('navigation-studio__inspector')).toBe(true);
    expect(control<HTMLDetailsElement>('[data-section="preview"]').open).toBe(false);
    expect(control<HTMLButtonElement>('[data-move-up="a"]').disabled).toBe(true);
    expect(control<HTMLButtonElement>('[data-outdent="a"]').disabled).toBe(true);
  });

  it('keeps drafts and the search input intact across search and preview changes', async () => {
    edit('title', 'Unsaved home');
    await click('[data-toggle-add]');
    const search = control<HTMLInputElement>('[data-nav-search]');
    search.value = 'Documentation';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(control('[data-nav-search]')).toBe(search);
    expect(control<HTMLInputElement>('[name="title"]').value).toBe('Unsaved home');
    await click('[data-preview="mobile"]');
    expect(control<HTMLInputElement>('[name="title"]').value).toBe('Unsaved home');
    expect(control<HTMLInputElement>('[data-nav-search]').value).toBe('Documentation');
    expect(control('[data-draft-status]').textContent).toBe('Unsaved changes');
  });

  it('protects unsaved fields on item and menu switches', async () => {
    edit('title', 'Keep me');
    await click('[data-select-item="b"]');
    expect(control<HTMLInputElement>('[name="title"]').value).toBe('Keep me');
    const menu = control<HTMLSelectElement>('[data-menu-select]');
    menu.value = 'footer-menu';
    menu.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(control<HTMLSelectElement>('[data-menu-select]').value).toBe('header-main');
    expect(control<HTMLInputElement>('[name="title"]').value).toBe('Keep me');
    expect(bpDialog.confirm).toHaveBeenCalledTimes(2);
  });

  it('keeps the current menu and draft after an accepted switch fails', async () => {
    edit('title', 'Keep on failure');
    jest.mocked(bpDialog.confirm).mockResolvedValue(true);
    rejectTree = 'footer-menu';
    const menu = control<HTMLSelectElement>('[data-menu-select]');
    menu.value = 'footer-menu';
    menu.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(control<HTMLSelectElement>('[data-menu-select]').value).toBe('header-main');
    expect(control<HTMLInputElement>('[name="title"]').value).toBe('Keep on failure');
    expect(control('[data-nav-feedback]').textContent).toContain('NAV_STUDIO_MENU_LOAD_FAILED');
  });

  it('adds top-level links by default and only nests into an explicit destination', async () => {
    await click('[data-toggle-add]');
    await click('[data-add-page="p2"]');
    expect(calls('addItem').at(-1)?.[1].params.parentId).toBeNull();
    const target = control<HTMLSelectElement>('[data-add-parent]');
    target.value = 'a';
    target.dispatchEvent(new Event('change', { bubbles: true }));
    await click('[data-add-page="p2"]');
    expect(calls('addItem').at(-1)?.[1].params.parentId).toBe('a');
  });

  it('saves the chosen page URL and preserves fields absent from basic mode', async () => {
    edit('sourceId', 'p2');
    await click('[data-save-item]');
    expect(calls('updateItem').at(-1)?.[1].params).toMatchObject({ sourceId: 'p2', sourceModule: 'pagesManager', url: '/docs', rel: 'nofollow' });
    expect(control('[data-draft-status]').textContent).toBe('Saved');
  });

  it('clears page ownership when converting to a custom link', async () => {
    edit('type', 'custom');
    edit('url', 'https://example.test');
    await click('[data-save-item]');
    expect(calls('updateItem').at(-1)?.[1].params).toMatchObject({ type: 'custom', sourceId: null, sourceModule: null, url: 'https://example.test' });
  });

  it('retains input after a failed save and makes the error actionable', async () => {
    rejectAction = 'updateItem';
    edit('title', 'Retry this title');
    await click('[data-save-item]');
    expect(control<HTMLInputElement>('[name="title"]').value).toBe('Retry this title');
    expect(control('[data-nav-feedback]').textContent).toContain('NAV_STUDIO_SAVE_FAILED');
    expect(control<HTMLButtonElement>('[data-save-item]').disabled).toBe(false);
    expect(control('.navigation-studio').getAttribute('aria-busy')).toBe('false');
  });

  it('rejects a missing page target before writing', async () => {
    edit('sourceId', '');
    await click('[data-save-item]');
    expect(calls('updateItem')).toHaveLength(0);
    expect(control('[data-nav-feedback]').textContent).toContain('NAV_STUDIO_PAGE_REQUIRED');
  });

  it('supports nesting without drag and saves child parent references', async () => {
    await click('[data-indent="b"]');
    expect(calls('updateItem').find(([, p]) => p.params.itemId === 'b')?.[1].params.parentId).toBe('a');
  });

  it('does not drag an ancestor when a nested row starts dragging', async () => {
    const child = control('[data-item-id="child"]');
    child.dispatchEvent(new Event('dragstart', { bubbles: true }));
    control('[data-drop-child="b"]').dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    await settle();
    expect(calls('updateItem').find(([, p]) => p.params.itemId === 'child')?.[1].params.parentId).toBe('b');
    expect(calls('updateItem').find(([, p]) => p.params.itemId === 'a')?.[1].params.parentId).toBeNull();
  });

  it('filters inactive links from preview and keeps preview clicks in the editor', () => {
    const preview = control('.navigation-studio__preview');
    expect(preview.textContent).not.toContain('Private draft');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    preview.querySelector('a')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('offers retry after initial loading fails', async () => {
    rejectAction = 'locations';
    await render(host);
    expect(control('[role="alert"]').textContent).toContain('PLAINSPACE_NAVIGATION_STUDIO_LOAD_FAILED');
    rejectAction = '';
    await click('[data-retry]');
    expect(control('[data-menu-select]')).not.toBeNull();
  });
});
