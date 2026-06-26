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

  test('renderPageList exposes child pages through expandable table rows', () => {
    const host = document.createElement('div');
    renderPageList(host, basePages());

    expect(host.querySelector('ul.page-list')).toBeNull();
    expect(host.querySelector('table.page-list-table')).not.toBeNull();

    const pageRows = Array.from(host.querySelectorAll<HTMLTableRowElement>('tr.page-list-row'));
    const byTitle = (title: string) => pageRows.find(row => (
      row.querySelector('.page-name')?.textContent === title
    )) as HTMLTableRowElement;
    const homeRow = byTitle('Home');
    const aboutRow = byTitle('About');
    const teamRow = byTitle('Team');

    expect(homeRow.hidden).toBe(false);
    expect(aboutRow.hidden).toBe(true);
    expect(teamRow.hidden).toBe(true);

    const homeToggle = homeRow.querySelector<HTMLButtonElement>('.page-list-toggle');
    expect(homeToggle?.getAttribute('aria-expanded')).toBe('false');
    homeToggle?.click();
    expect(homeToggle?.getAttribute('aria-expanded')).toBe('true');
    expect(aboutRow.hidden).toBe(false);
    expect(teamRow.hidden).toBe(true);

    aboutRow.querySelector<HTMLButtonElement>('.page-list-toggle')?.click();
    expect(teamRow.hidden).toBe(false);

    homeToggle?.click();
    expect(homeToggle?.getAttribute('aria-expanded')).toBe('false');
    expect(aboutRow.hidden).toBe(true);
    expect(teamRow.hidden).toBe(true);
    expect(aboutRow.querySelector('.page-list-toggle')?.getAttribute('aria-expanded')).toBe('false');
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
