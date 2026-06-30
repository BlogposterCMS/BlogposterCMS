/**
 * @jest-environment jsdom
 */

import {
  adminBaseHref,
  adminSlugFromPath,
  deleteAdminPage,
  errorMessage,
  fetchAdminPageBySlug,
  isProtectedAdminWorkspace,
  normalizeAdminBase,
  toAdminPage
} from '../ui/shell/dashboard/contentHeaderActionsData';

describe('contentHeaderActionsData', () => {
  it('normalizes admin page payloads and protected workspace slugs', () => {
    expect(toAdminPage([{ id: 1, slug: 'home' }])).toEqual({ id: 1, slug: 'home' });
    expect(toAdminPage({ id: '2', slug: 'content/news' })).toEqual({ id: '2', slug: 'content/news' });
    expect(toAdminPage(null)).toBeNull();
    expect(isProtectedAdminWorkspace({ slug: 'home' })).toBe(true);
    expect(isProtectedAdminWorkspace({ slug: 'settings' })).toBe(true);
    expect(isProtectedAdminWorkspace({ slug: 'settings/users' })).toBe(false);
    expect(isProtectedAdminWorkspace({ slug: 'content' })).toBe(false);
  });

  it('normalizes admin base paths and current admin slugs', () => {
    expect(normalizeAdminBase('/admin//')).toBe('/admin/');
    expect(normalizeAdminBase(undefined)).toBe('/admin/');
    expect(adminSlugFromPath('/admin/content/news/', '/admin//')).toBe('content/news');
    expect(adminSlugFromPath('/cms/admin/content', '/cms/admin/')).toBe('content');
    expect(adminBaseHref('/admin/')).toBe('/admin');
    expect(adminBaseHref('/cms/admin')).toBe('/cms/admin');
  });

  it('fetches admin pages through the runtime admin facade', async () => {
    const emit = jest.fn().mockResolvedValue({ id: 'page-1', slug: 'content' });

    await expect(fetchAdminPageBySlug(emit, 'admin-token', 'content')).resolves.toEqual({
      id: 'page-1',
      slug: 'content'
    });
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'getBySlug',
      params: {
        slug: 'content',
        lane: 'admin'
      }
    });
  });

  it('deletes admin pages through the runtime admin facade', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);

    await deleteAdminPage(emit, 'admin-token', 'page-1');

    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'delete',
      params: { pageId: 'page-1' }
    });
  });

  it('fails with a searchable error code when the emitter is missing', async () => {
    await expect(fetchAdminPageBySlug(undefined as never, 'admin-token', 'content'))
      .rejects.toThrow('SHELL_CONTENT_HEADER_EMITTER_UNAVAILABLE');
    await expect(deleteAdminPage(undefined as never, 'admin-token', 'page-1'))
      .rejects.toThrow('SHELL_CONTENT_HEADER_EMITTER_UNAVAILABLE');
  });

  it('formats unknown errors for header alerts', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('bad')).toBe('bad');
  });
});
