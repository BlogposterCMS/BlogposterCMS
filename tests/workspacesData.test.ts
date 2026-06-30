/**
 * @jest-environment jsdom
 */

import {
  ADMIN_LANE,
  createWorkspacePage,
  createWorkspaceSubpage,
  fetchAdminPageBySlug,
  fetchAdminPagesByLane,
  toAdminPages
} from '../ui/shell/dashboard/workspacesData';

describe('workspacesData', () => {
  it('normalizes admin page result containers', () => {
    expect(ADMIN_LANE).toBe('admin');
    expect(toAdminPages([{ slug: 'home' }])).toEqual([{ slug: 'home' }]);
    expect(toAdminPages({ pages: [{ slug: 'settings' }] })).toEqual([{ slug: 'settings' }]);
    expect(toAdminPages({ data: { slug: 'single' } })).toEqual([{ slug: 'single' }]);
    expect(toAdminPages({ slug: 'direct' })).toEqual([{ slug: 'direct' }]);
    expect(toAdminPages('bad')).toEqual([]);
  });

  it('fetches admin pages through the runtime admin facade', async () => {
    const emit = jest.fn().mockResolvedValue({ pages: [{ slug: 'workspace' }] });

    await expect(fetchAdminPagesByLane(emit, 'admin-token')).resolves.toEqual([{ slug: 'workspace' }]);
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'byLane',
      params: { lane: 'admin' }
    });
  });

  it('fetches a workspace parent page by slug', async () => {
    const emit = jest.fn().mockResolvedValue([{ id: 'parent-1', slug: 'content' }]);

    await expect(fetchAdminPageBySlug(emit, 'admin-token', 'content')).resolves.toEqual({
      id: 'parent-1',
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

  it('creates top-level workspace pages', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);

    await createWorkspacePage(emit, 'admin-token', {
      title: 'Content',
      slug: 'content',
      icon: '/admin/assets/icons/file-box.svg'
    });

    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'create',
      params: {
        title: 'Content',
        slug: 'content',
        lane: 'admin',
        status: 'published',
        parent_id: null,
        meta: { icon: '/admin/assets/icons/file-box.svg', workspace: 'content' }
      }
    });
  });

  it('creates workspace subpages with parent ids', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);

    await createWorkspaceSubpage(emit, 'admin-token', {
      title: 'News',
      slug: 'news',
      workspace: 'content',
      parentId: 'parent-1',
      icon: '/admin/assets/icons/file.svg'
    });

    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'create',
      params: {
        title: 'News',
        slug: 'content/news',
        lane: 'admin',
        status: 'published',
        parent_id: 'parent-1',
        meta: { icon: '/admin/assets/icons/file.svg' }
      }
    });
  });

  it('fails with a searchable error code when the emitter is missing', async () => {
    await expect(fetchAdminPagesByLane(undefined as never, 'admin-token'))
      .rejects.toThrow('SHELL_WORKSPACES_EMITTER_UNAVAILABLE');
    await expect(createWorkspacePage(undefined as never, 'admin-token', {
      title: 'Content',
      slug: 'content',
      icon: '/icon.svg'
    })).rejects.toThrow('SHELL_WORKSPACES_EMITTER_UNAVAILABLE');
  });
});
