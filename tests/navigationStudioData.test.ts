import {
  buildNavigationDiagnostics,
  createMegaMenuDesign,
  ensureNavigationStudioDefaults,
  fetchNavigationTree,
  generateItemsFromPages,
  navigationItemPayload,
  replaceMenuItemsWithGeneratedPages
} from '../ui/widgets/plainspace/admin/navigationStudioData';

describe('navigationStudioData', () => {
  it('seeds missing studio locations and menus through navigation contracts', async () => {
    const emit = jest.fn().mockResolvedValue({});

    await ensureNavigationStudioDefaults(emit, 'admin-token', [], []);

    const routes = emit.mock.calls.map(call => `${call[1].resource}.${call[1].action}`);
    expect(routes.filter(route => route === 'navigation.registerLocation')).toHaveLength(5);
    expect(routes.filter(route => route === 'navigation.upsertMenu')).toHaveLength(5);
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', expect.objectContaining({
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'navigation',
      action: 'registerLocation',
      params: expect.objectContaining({ key: 'primary' })
    }));
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', expect.objectContaining({
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'navigation',
      action: 'upsertMenu',
      params: expect.objectContaining({
        key: 'header-main',
        locationKey: 'primary'
      })
    }));
  });

  it('loads a selected menu tree through a stable menu reference', async () => {
    const emit = jest.fn().mockResolvedValue({
      tree: [{ id: 'home', title: 'Home', url: '/' }]
    });

    await expect(fetchNavigationTree(emit, 'admin-token', { key: 'header-main' }))
      .resolves.toEqual([{ id: 'home', title: 'Home', url: '/' }]);
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'navigation',
      action: 'tree',
      params: { menuKey: 'header-main' }
    });
  });

  it('generates a three-level public page tree for menu bootstrapping', () => {
    const generated = generateItemsFromPages([
      { id: 1, title: 'Home', slug: '', status: 'published', lane: 'public' },
      { id: 2, title: 'Services', slug: 'services', status: 'published', lane: 'public' },
      { id: 3, title: 'SEO', slug: 'services/seo', status: 'published', lane: 'public', parent_id: 2 },
      { id: 4, title: 'Technical SEO', slug: 'services/seo/technical', status: 'draft', lane: 'public', parent_id: 3 },
      { id: 5, title: 'Too deep', slug: 'too-deep', status: 'published', lane: 'public', parent_id: 4 },
      { id: 6, title: 'Admin', slug: 'admin-only', status: 'published', lane: 'admin' }
    ]);

    expect(generated.map(item => item.title)).toEqual(['Home', 'Services']);
    expect(generated[1].children[0]).toMatchObject({
      title: 'SEO',
      url: '/services/seo',
      status: 'active'
    });
    expect(generated[1].children[0].children[0]).toMatchObject({
      title: 'Technical SEO',
      status: 'draft'
    });
    expect(generated[1].children[0].children[0].children).toEqual([]);
  });

  it('reports actionable menu diagnostics', () => {
    const items = [
      { id: 'a', title: 'Services', url: '/services', status: 'active' },
      { id: 'b', title: 'Services', url: 'https://example.test', status: 'active' },
      { id: 'c', title: 'Broken', url: '/missing', status: 'active', type: 'page' },
      { id: 'd', title: 'Mega', url: '/mega', status: 'active', meta: { mega: { enabled: true } } }
    ];

    const diagnostics = buildNavigationDiagnostics(items, [
      { id: 1, title: 'Services', slug: 'services', status: 'published', lane: 'public' }
    ], { label: 'Mobile Menu', key: 'mobile-menu' });

    expect(diagnostics.map(diagnostic => diagnostic.code)).toEqual(expect.arrayContaining([
      'NAV_STUDIO_DUPLICATE_LABEL',
      'NAV_STUDIO_EXTERNAL_TARGET',
      'NAV_STUDIO_INTERNAL_TARGET_MISSING',
      'NAV_STUDIO_MEGA_LAYOUT_MISSING'
    ]));
  });

  it('keeps item update payloads searchable and complete', () => {
    expect(navigationItemPayload({
      id: 'item-1',
      menu_id: 'menu-1',
      title: 'Home',
      url: '/',
      meta: { icon: 'house' }
    }, {
      position: 2,
      parentId: 'parent-1'
    })).toMatchObject({
      itemId: 'item-1',
      menuId: 'menu-1',
      parentId: 'parent-1',
      title: 'Home',
      position: 2,
      meta: { icon: 'house' }
    });
  });

  it('replaces current items with generated page links in parent-first order', async () => {
    const emit = jest.fn(async (_eventName, payload) => {
      if (`${payload.resource}.${payload.action}` === 'navigation.addItem') {
        return { id: `new-${payload.params.sourceId}`, ...payload.params };
      }
      return { done: true };
    });

    await replaceMenuItemsWithGeneratedPages(
      emit,
      'admin-token',
      { id: 'menu-1' },
      [{ id: 'old-parent', children: [{ id: 'old-child' }] }],
      [
        { id: 1, title: 'Services', slug: 'services', status: 'published', lane: 'public' },
        { id: 2, title: 'SEO', slug: 'services/seo', status: 'published', lane: 'public', parent_id: 1 }
      ]
    );

    expect(emit.mock.calls.map(call => `${call[1].resource}.${call[1].action}`)).toEqual([
      'navigation.deleteItem',
      'navigation.deleteItem',
      'navigation.addItem',
      'navigation.addItem'
    ]);
    expect(emit.mock.calls[2][1].params).toMatchObject({ sourceId: '1', parentId: null, position: 0 });
    expect(emit.mock.calls[3][1].params).toMatchObject({ sourceId: '2', parentId: 'new-1', position: 0 });
  });

  it('creates dedicated draft designs for mega menu panels', async () => {
    const emit = jest.fn().mockResolvedValue({ id: 'mega-1' });

    await expect(createMegaMenuDesign(emit, 'admin-token', 'owner-1', 'Mega Menu - Services'))
      .resolves.toBe('mega-1');
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', expect.objectContaining({
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'designer',
      action: 'save',
      params: expect.objectContaining({
        design: expect.objectContaining({
          ownerId: 'owner-1',
          title: 'Mega Menu - Services',
          isDraft: true,
          meta: { surface: 'mega-menu' }
        }),
        widgets: [],
        layout: null
      })
    }), 20000);
  });
});
