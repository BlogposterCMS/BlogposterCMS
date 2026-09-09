/**
 * @jest-environment jsdom
 */

const {
  buildPageHierarchyRows,
  getAllowedParentPages,
  getParentValidationError,
  persistParentChange,
  renderPageList,
} = require('../ui/widgets/plainspace/admin/defaultwidgets/pageList/pageList.js');

describe('page parent reassignment helpers', () => {
  test('keeps expanded nested pages when switching filters and back', async () => {
    const host = document.createElement('div');
    renderPageList(host, basePages());
    const row = (name: string) => Array.from(host.querySelectorAll<HTMLTableRowElement>('.page-manager__row'))
      .find(item => item.querySelector('.page-name')?.textContent === name)!;
    row('Home').querySelector<HTMLButtonElement>('.page-manager__toggle')!.click();
    // Branch changes settle asynchronously while the workspace guards actions.
    await new Promise(resolve => setTimeout(resolve, 0));
    row('About').querySelector<HTMLButtonElement>('.page-manager__toggle')!.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    const filter = (name: string) => Array.from(host.querySelectorAll<HTMLButtonElement>('.filter'))
      .find(item => item.dataset.filter === name)!.click();
    filter('Active');
    filter('All');
    expect(row('Team').hidden).toBe(false);
    expect(row('Home').querySelector('.page-manager__toggle')?.getAttribute('aria-label')).toBe('Hide child pages for Home');
  });
  const basePages = () => [
    { id: 1, title: 'Home', lane: 'public', parent_id: null },
    { id: 2, title: 'About', lane: 'public', parent_id: 1 },
    { id: 3, title: 'Team', lane: 'public', parent_id: 2 },
    { id: 4, title: 'Admin page', lane: 'admin', parent_id: null },
  ];

  test('getAllowedParentPages blocks self, descendants, and incompatible lanes', () => {
    const pages = basePages();
    const allowedForAbout = getAllowedParentPages(pages, pages[1]);

    expect(allowedForAbout.map((page: { id: number }) => page.id)).toEqual([1]);
  });

  test('excludes trashed parents while retaining a current relationship for metadata edits', () => {
    const pages = [...basePages(), { id: 5, title: 'Deleted', lane: 'public', status: 'deleted', parent_id: null }];
    expect(getAllowedParentPages(pages, pages[1]).some((page: { id: number }) => page.id === 5)).toBe(false);
    expect(getParentValidationError(pages, pages[1], 5)).toBe('A deleted page cannot be selected as a new parent.');
    expect(getAllowedParentPages(pages, { ...pages[1], parent_id: 5 }).some((page: { id: number }) => page.id === 5)).toBe(true);
  });

  test('buildPageHierarchyRows nests visible child pages without top-level duplicates', () => {
    const rows = buildPageHierarchyRows(basePages());

    expect(rows.map((row: { page: { title: string }; depth: number; childCount: number }) => ({
      title: row.page.title,
      depth: row.depth,
      childCount: row.childCount,
    }))).toEqual([
      { title: 'Home', depth: 0, childCount: 1 },
      { title: 'About', depth: 1, childCount: 1 },
      { title: 'Team', depth: 2, childCount: 0 },
      { title: 'Admin page', depth: 0, childCount: 0 },
    ]);
  });

  test('getParentValidationError catches cyclic and lane violations', () => {
    const pages = basePages();

    expect(getParentValidationError(pages, pages[0], 3)).toBe(
      'Parent selection would create a circular hierarchy.'
    );
    expect(getParentValidationError(pages, pages[0], 4)).toBe(
      'Parent page must be in the same lane.'
    );
    expect(getParentValidationError(pages, pages[0], 1)).toBe(
      'A page cannot be its own parent.'
    );
  });

  test('persistParentChange refreshes local list and reports success', async () => {
    const pages = basePages();
    const page = pages[1];
    const feedback: Array<{ type: string; message: string }> = [];
    const service = {
      updateParent: jest.fn().mockResolvedValue({ ok: true }),
    };
    const refreshedPages = [
      { id: 1, title: 'Home', lane: 'public', parent_id: null },
      { id: 2, title: 'About', lane: 'public', parent_id: null },
      { id: 3, title: 'Team', lane: 'public', parent_id: 2 },
    ];

    const result = await persistParentChange({
      pages,
      page,
      parentId: null,
      setFeedback: (type: string, message: string) => feedback.push({ type, message }),
      service,
      fetchPagesFn: async () => refreshedPages,
    });

    expect(result).toBe(true);
    expect(service.updateParent).toHaveBeenCalledWith(page, null);
    expect(pages).toEqual(refreshedPages);
    expect(feedback.at(-1)).toEqual({ type: 'success', message: 'Parent page updated.' });
  });

  test('persistParentChange reports service errors without mutating list', async () => {
    const pages = basePages();
    const snapshot = pages.map(page => ({ ...page }));
    const feedback: Array<{ type: string; message: string }> = [];
    const service = {
      updateParent: jest.fn().mockRejectedValue(new Error('network down')),
    };

    const result = await persistParentChange({
      pages,
      page: pages[1],
      parentId: 1,
      setFeedback: (type: string, message: string) => feedback.push({ type, message }),
      service,
      fetchPagesFn: async () => {
        throw new Error('should not run');
      },
    });

    expect(result).toBe(false);
    expect(pages).toEqual(snapshot);
    expect(feedback.at(-1)).toEqual({
      type: 'error',
      message: 'Failed to update parent: network down',
    });
  });
});
