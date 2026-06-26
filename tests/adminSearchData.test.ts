/**
 * @jest-environment jsdom
 */

import {
  adminSearchDisabledPlaceholder,
  errorMessage,
  fetchAdminSearchPages,
  resultPages
} from '../ui/shell/search/adminSearchData';

describe('adminSearchData', () => {
  it('normalizes page search results and classifies disabled placeholders', () => {
    expect(resultPages({ pages: [{ id: 1, slug: 'home' }, null, { slug: 'bad' }] }))
      .toEqual([{ id: 1, slug: 'home' }]);
    expect(resultPages({ rows: [{ id: 'row-1' }] })).toEqual([{ id: 'row-1' }]);
    expect(resultPages('bad')).toEqual([]);
    expect(adminSearchDisabledPlaceholder(new Error('permission denied'))).toBe('Search unavailable');
    expect(adminSearchDisabledPlaceholder(new Error('auth required'))).toBe('Login required');
    expect(adminSearchDisabledPlaceholder(new Error('other'))).toBeNull();
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('fetches admin search pages through pagesManager search', async () => {
    const emit = jest.fn().mockResolvedValue({ pages: [{ id: 'page-1', title: 'Home' }] });

    await expect(fetchAdminSearchPages(emit, 'admin-token', 'home')).resolves.toEqual([
      { id: 'page-1', title: 'Home' }
    ]);
    expect(emit).toHaveBeenCalledWith('searchPages', {
      jwt: 'admin-token',
      moduleName: 'pagesManager',
      moduleType: 'core',
      query: 'home',
      lane: 'all',
      limit: 10
    });
  });

  it('fails with a searchable error code when the emitter is missing', async () => {
    await expect(fetchAdminSearchPages(undefined as never, 'admin-token', 'home'))
      .rejects.toThrow('SHELL_ADMIN_SEARCH_EMITTER_UNAVAILABLE');
  });
});
