/**
 * @jest-environment jsdom
 */

import {
  createPublicPageForPicker,
  errorMessage,
  fetchPageSlugById,
  fetchPublicPages,
  savePageOrder,
  slugFromPageLookup,
  toPages
} from '../ui/shell/dashboard/pagePickerData';

describe('pagePickerData', () => {
  it('normalizes page lists and page lookup slugs', () => {
    expect(toPages({ pages: [{ pageId: 1, title: 'Home' }, null, { title: 'bad' }] }))
      .toEqual([{ pageId: 1, title: 'Home' }]);
    expect(toPages([{ pageId: 'page-2', slug: 'about' }])).toEqual([{ pageId: 'page-2', slug: 'about' }]);
    expect(toPages('bad')).toEqual([]);
    expect(slugFromPageLookup({ data: { slug: 'created' } })).toBe('created');
    expect(slugFromPageLookup({ data: { slug: '' } })).toBeNull();
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('fetches public pages through pagesManager lane loading', async () => {
    const emit = jest.fn().mockResolvedValue({ pages: [{ pageId: 'page-1', title: 'Home' }] });

    await expect(fetchPublicPages(emit, 'admin-token')).resolves.toEqual([
      { pageId: 'page-1', title: 'Home' }
    ]);
    expect(emit).toHaveBeenCalledWith('getPagesByLane', {
      jwt: 'admin-token',
      moduleName: 'pagesManager',
      moduleType: 'core',
      lane: 'public'
    });
  });

  it('saves page order through pagesManager updates', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);

    await savePageOrder(emit, 'admin-token', 7, 2);

    expect(emit).toHaveBeenCalledWith('updatePage', {
      jwt: 'admin-token',
      moduleName: 'pagesManager',
      moduleType: 'core',
      pageId: 7,
      newOrder: 2
    });
  });

  it('creates a public page and returns its id', async () => {
    const emit = jest.fn().mockResolvedValue({ pageId: 'page-9' });

    await expect(createPublicPageForPicker(emit, 'admin-token', 'Landing', 'landing'))
      .resolves.toBe('page-9');
    expect(emit).toHaveBeenCalledWith('createPage', {
      jwt: 'admin-token',
      moduleName: 'pagesManager',
      moduleType: 'core',
      title: 'Landing',
      slug: 'landing',
      lane: 'public',
      status: 'published'
    });
  });

  it('resolves created page slugs by id', async () => {
    const emit = jest.fn().mockResolvedValue({ data: { slug: 'landing' } });

    await expect(fetchPageSlugById(emit, 'admin-token', 'page-9')).resolves.toBe('landing');
    expect(emit).toHaveBeenCalledWith('getPageById', {
      jwt: 'admin-token',
      moduleName: 'pagesManager',
      moduleType: 'core',
      pageId: 'page-9'
    });
  });

  it('fails with searchable error codes for missing ids, slugs, or emitters', async () => {
    await expect(createPublicPageForPicker(jest.fn().mockResolvedValue({}), 'admin-token', 'Landing', 'landing'))
      .rejects.toThrow('SHELL_PAGE_PICKER_PAGE_ID_UNAVAILABLE');
    await expect(fetchPageSlugById(jest.fn().mockResolvedValue({ data: {} }), 'admin-token', 'page-9'))
      .rejects.toThrow('SHELL_PAGE_PICKER_CREATED_SLUG_UNAVAILABLE');
    await expect(fetchPublicPages(undefined as never, 'admin-token'))
      .rejects.toThrow('SHELL_PAGE_PICKER_EMITTER_UNAVAILABLE');
  });
});
