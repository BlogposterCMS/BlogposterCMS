/**
 * @jest-environment jsdom
 */

import {
  fetchRuntimeChildPages,
  fetchRuntimeDesign,
  fetchRuntimePageById,
  fetchRuntimePageBySlug,
  fetchRuntimeWidgetRegistry,
  laneAuthPayload,
  loadRuntimeGlobalLayout,
  loadRuntimeLayoutForViewport,
  loadRuntimeLayoutTemplate,
  resolveRuntimeWidgetLane,
  saveRuntimeLayoutForViewport
} from '../ui/runtime/main/runtimePageData';

describe('runtimePageData', () => {
  beforeEach(() => {
    window.ADMIN_TOKEN = 'admin-token';
    window.PUBLIC_TOKEN = 'public-token';
  });

  afterEach(() => {
    delete window.ADMIN_TOKEN;
    delete window.PUBLIC_TOKEN;
  });

  it('builds lane auth payloads and clamps public widget lanes', () => {
    const warn = jest.fn();

    expect(laneAuthPayload('admin')).toEqual({ jwt: 'admin-token' });
    expect(laneAuthPayload('public')).toEqual({ jwt: 'public-token' });
    expect(resolveRuntimeWidgetLane('admin', { widgetLane: 'admin' }, warn)).toBe('admin');
    expect(resolveRuntimeWidgetLane('public', { widgetLane: 'admin' }, warn)).toBe('public');
    expect(warn).toHaveBeenCalledWith(
      '[Renderer] widgetLane="admin" on public page => forcing "public"'
    );
  });

  it('fetches page and child-page data through runtime facades', async () => {
    const emit = jest.fn()
      .mockResolvedValueOnce({ data: { id: 'page-1' } })
      .mockResolvedValueOnce([{ id: 'child-1' }])
      .mockResolvedValueOnce({ data: { id: 'child-1', html: '<p>x</p>' } });

    await expect(fetchRuntimePageBySlug(emit, 'home', 'public')).resolves.toEqual({ id: 'page-1' });
    await expect(fetchRuntimeChildPages(emit, 'page-1', 'public')).resolves.toEqual([{ id: 'child-1' }]);
    await expect(fetchRuntimePageById(emit, 'child-1', 'public')).resolves.toEqual({
      id: 'child-1',
      html: '<p>x</p>'
    });

    expect(emit).toHaveBeenNthCalledWith(1, 'cmsPublicRuntimeRequest', {
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'getBySlug',
      params: { slug: 'home', lane: 'public' }
    });
    expect(emit).toHaveBeenNthCalledWith(2, 'cmsPublicRuntimeRequest', {
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'children',
      params: { parentId: 'page-1', lane: 'public' }
    });
    expect(emit).toHaveBeenNthCalledWith(3, 'cmsPublicRuntimeRequest', {
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'get',
      params: { pageId: 'child-1', lane: 'public' }
    });
  });

  it('loads registry and layouts with lane-specific auth rules', async () => {
    const emit = jest.fn()
      .mockResolvedValueOnce({ widgets: [{ id: 'stats' }] })
      .mockResolvedValueOnce({ layout: [{ id: 'global' }] })
      .mockResolvedValueOnce({ layout: [{ id: 'template' }] })
      .mockResolvedValueOnce({ layout: [{ id: 'viewport' }] });

    await expect(fetchRuntimeWidgetRegistry(emit, 'admin', 'admin')).resolves.toEqual([{ id: 'stats' }]);
    await expect(loadRuntimeGlobalLayout(emit, 'admin')).resolves.toEqual([{ id: 'global' }]);
    await expect(loadRuntimeLayoutTemplate(emit, 'landing', 'public')).resolves.toEqual([{ id: 'template' }]);
    await expect(loadRuntimeLayoutForViewport(emit, 'page-1', 'public')).resolves.toEqual([{ id: 'viewport' }]);

    expect(emit).toHaveBeenNthCalledWith(1, 'cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'plainSpace',
      action: 'widgetRegistry',
      params: { lane: 'admin' }
    });
    expect(emit).toHaveBeenNthCalledWith(2, 'cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'plainSpace',
      action: 'globalLayoutTemplate',
      params: { lane: 'admin' }
    });
    expect(emit).toHaveBeenNthCalledWith(3, 'cmsPublicRuntimeRequest', {
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'plainSpace',
      action: 'layoutTemplate',
      params: { name: 'landing', lane: 'public' }
    });
    expect(emit).toHaveBeenNthCalledWith(4, 'cmsPublicRuntimeRequest', {
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'plainSpace',
      action: 'layoutForViewport',
      params: { pageId: 'page-1', lane: 'public', viewport: 'desktop' }
    });
  });

  it('fetches designs and saves admin layouts through runtime events', async () => {
    const emit = jest.fn()
      .mockResolvedValueOnce({ widgets: [] })
      .mockResolvedValueOnce({ ok: true });
    const layout = [{ id: 'w1' }];

    await fetchRuntimeDesign(emit, 'design-1', 'public');
    await saveRuntimeLayoutForViewport(emit, 'page-1', 'admin', layout);

    expect(emit).toHaveBeenNthCalledWith(1, 'cmsPublicRuntimeRequest', {
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'designer',
      action: 'get',
      params: { id: 'design-1', lane: 'public' }
    });
    expect(emit).toHaveBeenNthCalledWith(2, 'cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'plainSpace',
      action: 'saveLayoutForViewport',
      params: {
        pageId: 'page-1',
        lane: 'admin',
        viewport: 'desktop',
        layout
      }
    });
  });
});
