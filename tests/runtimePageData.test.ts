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

  it('fetches page and child-page data through canonical runtime events', async () => {
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

    expect(emit).toHaveBeenNthCalledWith(1, 'getPageBySlug', {
      moduleName: 'pagesManager',
      moduleType: 'core',
      slug: 'home',
      lane: 'public'
    });
    expect(emit).toHaveBeenNthCalledWith(2, 'getChildPages', {
      parentId: 'page-1',
      moduleName: 'pagesManager',
      moduleType: 'core',
      jwt: 'public-token'
    });
    expect(emit).toHaveBeenNthCalledWith(3, 'getPageById', {
      pageId: 'child-1',
      lane: 'public',
      moduleName: 'pagesManager',
      moduleType: 'core',
      jwt: 'public-token'
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

    expect(emit).toHaveBeenNthCalledWith(1, 'widget.registry.request.v1', {
      lane: 'admin',
      moduleName: 'plainspace',
      moduleType: 'core',
      jwt: 'admin-token'
    });
    expect(emit).toHaveBeenNthCalledWith(2, 'getGlobalLayoutTemplate', {
      moduleName: 'plainspace',
      moduleType: 'core',
      jwt: 'admin-token',
      lane: 'admin'
    });
    expect(emit).toHaveBeenNthCalledWith(3, 'getLayoutTemplate', {
      name: 'landing',
      moduleName: 'plainspace',
      moduleType: 'core',
      jwt: 'public-token',
      lane: 'public'
    });
    expect(emit).toHaveBeenNthCalledWith(4, 'getLayoutForViewport', {
      moduleName: 'plainspace',
      moduleType: 'core',
      pageId: 'page-1',
      lane: 'public',
      viewport: 'desktop'
    });
  });

  it('fetches designs and saves admin layouts through runtime events', async () => {
    const emit = jest.fn()
      .mockResolvedValueOnce({ widgets: [] })
      .mockResolvedValueOnce({ ok: true });
    const layout = [{ id: 'w1' }];

    await fetchRuntimeDesign(emit, 'design-1', 'public');
    await saveRuntimeLayoutForViewport(emit, 'page-1', 'admin', layout);

    expect(emit).toHaveBeenNthCalledWith(1, 'designer.getDesign', {
      id: 'design-1',
      moduleName: 'designer',
      moduleType: 'community',
      jwt: 'public-token'
    });
    expect(emit).toHaveBeenNthCalledWith(2, 'saveLayoutForViewport', {
      jwt: 'admin-token',
      moduleName: 'plainspace',
      moduleType: 'core',
      pageId: 'page-1',
      lane: 'admin',
      viewport: 'desktop',
      layout
    });
  });
});
