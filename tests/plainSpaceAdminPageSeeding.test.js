const {
  seedAdminPages
} = require('../mother/modules/plainSpace/plainSpaceService');
const {
  ADMIN_PAGES
} = require('../mother/modules/plainSpace/config/adminPages');

function createSeedingEmitter(existingPage = null, existingLayout = []) {
  const calls = [];
  return {
    calls,
    listenerCount: eventName => ([
      'getPageBySlug',
      'createPage',
      'updatePage',
      'getLayoutForViewport',
      'saveLayoutForViewport'
    ].includes(eventName) ? 1 : 0),
    emit(eventName, payload, callback) {
      calls.push({ eventName, payload });
      if (eventName === 'getPageBySlug') {
        callback(null, existingPage);
        return true;
      }
      if (eventName === 'createPage') {
        callback(null, { pageId: 'seed-page-1' });
        return true;
      }
      if (eventName === 'updatePage') {
        callback(null, { updated: true });
        return true;
      }
      if (eventName === 'getLayoutForViewport') {
        callback(null, { layout: existingLayout });
        return true;
      }
      if (eventName === 'saveLayoutForViewport') {
        callback(null, { saved: true });
        return true;
      }
      return false;
    }
  };
}

describe('PlainSpace admin page seeding', () => {
  it('seeds Analytics with editable standard subpages and the shared sidebar', () => {
    const pages = ADMIN_PAGES.filter(page => page.slug === 'analytics' || page.parentSlug === 'analytics');
    expect(pages.map(page => page.slug)).toEqual(['analytics', 'website', 'devices', 'system']);
    for (const page of pages) {
      expect(page.config.seedOnce).toBe(true);
      expect(page.config.dashboardLayout).toBeUndefined();
      expect(page.config.layout.sidebar).toBe('default-sidebar');
      expect(Object.values(page.config.widgetSlots)).toEqual(['full']);
    }
  });

  it.each(['published', 'deleted'])('preserves customized Analytics pages, including %s pages', async status => {
    const seed = ADMIN_PAGES.find(page => page.slug === 'analytics');
    const emitter = createSeedingEmitter({ id: 'analytics-user', slug: 'analytics', status, weight: 99,
      meta: { widgets: [], icon: '/assets/icons/house.svg', layout: { sidebar: 'user-sidebar' } } }, []);
    await seedAdminPages(emitter, 'admin-jwt', [seed]);
    expect(emitter.calls.filter(call => ['updatePage', 'createPage', 'saveLayoutForViewport'].includes(call.eventName))).toEqual([]);
  });

  it('unlocks the former fixed Analytics page without replacing custom instances', async () => {
    const seed = ADMIN_PAGES.find(page => page.slug === 'analytics');
    const plugin = { id: 'user-added', widgetId: 'pluginChart', slot: 'half', order: 17 };
    const emitter = createSeedingEmitter({ id: 'analytics-user', slug: 'analytics', weight: 99,
      meta: { dashboardLayout: 'fixed', widgets: ['analyticsDashboard', 'pluginChart'], widgetSlots: { analyticsDashboard: 'page', pluginChart: 'half' } }
    }, [{ id: 'original', widgetId: 'analyticsDashboard', slot: 'page', order: 0 }, plugin]);
    await seedAdminPages(emitter, 'admin-jwt', [seed]);
    const update = emitter.calls.find(call => call.eventName === 'updatePage').payload;
    expect(update.meta.dashboardLayout).toBeUndefined();
    expect(update.meta.widgets).toEqual(['analyticsDashboard', 'pluginChart']);
    expect(update.weight).toBeUndefined();
    expect(update.meta.layout.sidebar).toBe('default-sidebar');
    const layout = emitter.calls.find(call => call.eventName === 'saveLayoutForViewport').payload.layout;
    expect(layout).toEqual([{ id: 'original', widgetId: 'analyticsDashboard', slot: 'full', order: 0 }, plugin]);
  });

  it('does not re-add removed standard widgets on an Analytics subpage', async () => {
    const seed = ADMIN_PAGES.find(page => page.slug === 'devices' && page.parentSlug === 'analytics');
    const emitter = createSeedingEmitter({ id: 'custom', slug: 'analytics/devices', meta: { widgets: ['thirdPartyReport'] } }, [{ id: 'mine', widgetId: 'thirdPartyReport' }]);
    await seedAdminPages(emitter, 'admin-jwt', [seed]);
    expect(emitter.calls.filter(call => ['updatePage', 'createPage', 'saveLayoutForViewport'].includes(call.eventName))).toEqual([]);
  });
  it('uses fixed single-tool compositions and retires the duplicate Collections page', () => {
    for (const [slug, widgetId] of [['media', 'mediaExplorer'], ['widgets', 'widgetList'], ['designer-layouts', 'designerLayouts']]) {
      const page = ADMIN_PAGES.find(entry => entry.slug === slug && entry.parentSlug === 'content');
      expect(page.config).toMatchObject({ dashboardLayout: 'fixed', widgets: [widgetId], widgetSlots: { [widgetId]: 'page' } });
    }
    expect(ADMIN_PAGES.find(entry => entry.slug === 'collections' && entry.parentSlug === 'content').retired).toBe(true);
  });
  it('retires the old Layouts entry without recreating it or deleting templates', async () => {
    const seed = ADMIN_PAGES.find(page => page.slug === 'layouts');
    expect(seed.retired).toBe(true);
    const existing = createSeedingEmitter({ id: 'old-layouts', status: 'published' });
    await seedAdminPages(existing, 'admin-jwt', [seed]);
    expect(existing.calls.find(call => call.eventName === 'updatePage')?.payload)
      .toMatchObject({ pageId: 'old-layouts', status: 'deleted' });
    expect(existing.calls.some(call => call.eventName === 'createPage')).toBe(false);
    const fresh = createSeedingEmitter();
    await seedAdminPages(fresh, 'admin-jwt', [seed]);
    expect(fresh.calls.map(call => call.eventName)).toEqual(['getPageBySlug']);
  });
  const editorLayout = {
    header: 'top-header',
    sidebar: 'empty-sidebar',
    inheritsLayout: true
  };

  const editorSeed = {
    title: 'Page Editor',
    slug: 'pages/edit',
    lane: 'admin',
    weight: 10,
    config: {
      layout: editorLayout
    }
  };

  it('copies seed layout config into new admin page metadata', async () => {
    const emitter = createSeedingEmitter();

    await seedAdminPages(emitter, 'admin-jwt', [editorSeed]);

    const createCall = emitter.calls.find(call => call.eventName === 'createPage');
    expect(createCall).toBeTruthy();
    expect(createCall.payload.meta.layout).toEqual(editorLayout);
    expect(createCall.payload.meta.layout).not.toBe(editorLayout);
  });

  it('updates existing admin page metadata when the seed layout changes', async () => {
    const emitter = createSeedingEmitter({
      id: 'page-editor-seed',
      slug: 'pages/edit',
      lane: 'admin',
      weight: 10,
      meta: {
        layout: {
          header: 'top-header',
          sidebar: 'default-sidebar',
          inheritsLayout: true
        }
      }
    });

    await seedAdminPages(emitter, 'admin-jwt', [editorSeed]);

    const updateCall = emitter.calls.find(call => call.eventName === 'updatePage');
    expect(updateCall).toBeTruthy();
    expect(updateCall.payload.pageId).toBe('page-editor-seed');
    expect(updateCall.payload.meta.layout).toEqual(editorLayout);
  });

  it('defines the built-in page editor as a sidebar-free admin surface', () => {
    const editorPage = ADMIN_PAGES.find(page => page.slug === 'edit' && page.parentSlug === 'pages');

    expect(editorPage).toBeTruthy();
    expect(editorPage.config.layout.sidebar).toBe('empty-sidebar');
  });

  it('uses the Home workspace as a lightweight first-run entry point', () => {
    const homePage = ADMIN_PAGES.find(page => page.slug === 'home' && page.lane === 'admin');

    expect(homePage).toBeTruthy();
    expect(homePage.config.widgets).toEqual(['homeWebsite', 'homeOperations']);
    expect(homePage.config.retiredWidgets).toEqual(['roadmapUpcoming', 'dragbarDemo', 'roadmapIntro', 'pageStats', 'contentSummary']);
    expect(homePage.config.widgetSlots).toMatchObject({
      homeWebsite: 'twoThird',
      homeOperations: 'third'
    });
    expect(homePage.config.layout.sidebar).toBe('empty-sidebar');
  });

  it('retires old Home seed widgets while preserving custom widgets', async () => {
    const homeSeed = ADMIN_PAGES.find(page => page.slug === 'home' && page.lane === 'admin');
    const emitter = createSeedingEmitter({
      id: 'home-seed',
      slug: 'home',
      lane: 'admin',
      weight: 10,
      meta: {
        widgets: ['roadmapIntro', 'roadmapUpcoming', 'dragbarDemo', 'customWidget']
      }
    }, [
      { id: 'w0', widgetId: 'roadmapIntro' },
      { id: 'w1', widgetId: 'roadmapUpcoming' },
      { id: 'w2', widgetId: 'dragbarDemo' },
      { id: 'w3', widgetId: 'customWidget' }
    ]);

    await seedAdminPages(emitter, 'admin-jwt', [homeSeed]);

    const updateCall = emitter.calls.find(call => call.eventName === 'updatePage');
    expect(updateCall.payload.meta.widgets).toEqual([
      'customWidget',
      'homeWebsite',
      'homeOperations'
    ]);

    const saveLayoutCall = emitter.calls.find(call => call.eventName === 'saveLayoutForViewport');
    expect(saveLayoutCall.payload.layout.map(entry => entry.widgetId)).toEqual([
      'customWidget',
      'homeWebsite',
      'homeOperations'
    ]);
    expect(saveLayoutCall.payload.layout.find(entry => entry.widgetId === 'homeWebsite').slot).toBe('twoThird');
    expect(saveLayoutCall.payload.layout.find(entry => entry.widgetId === 'homeOperations').slot).toBe('third');
  });

  it('uses page management as the Content workspace entry point', () => {
    const contentPage = ADMIN_PAGES.find(page => page.slug === 'content' && page.lane === 'admin');

    expect(contentPage).toBeTruthy();
    expect(contentPage.config.widgets).toEqual(['pageList']);
    expect(contentPage.config.dashboardLayout).toBe('fixed');
    expect(contentPage.config.widgetSlots).toMatchObject({
      pageList: 'page'
    });
    expect(contentPage.config.actionButton.action).toBe('createNewPage');
  });

  it('consolidates page details and attachment editing in one fixed editor', () => {
    const editor = ADMIN_PAGES.find(page => page.slug === 'edit' && page.parentSlug === 'pages');
    expect(editor.config).toMatchObject({
      dashboardLayout: 'fixed', widgets: ['pageEditorWidget'], widgetSlots: { pageEditorWidget: 'page' }
    });
    expect(editor.config.widgetSlots.pageContent).toBeUndefined();
  });

  it('migrates fixed CMS composition while preserving personal saved layouts and other metadata', async () => {
    const seed = ADMIN_PAGES.find(page => page.slug === 'content' && page.lane === 'admin');
    const existing = { id: 'content-1', lane: 'admin', slug: 'content', meta: { widgets: ['pageList', 'pageStats', 'customWidget'], customSetting: true } };
    const emitter = createSeedingEmitter(existing, [{ id: 'custom-1', widgetId: 'customWidget' }]);
    await seedAdminPages(emitter, 'admin-jwt', [seed]);
    const update = emitter.calls.find(call => call.eventName === 'updatePage');
    expect(update.payload.meta).toMatchObject({ dashboardLayout: 'fixed', widgets: ['pageList'], widgetSlots: { pageList: 'page' }, customSetting: true });
    expect(emitter.calls.some(call => call.eventName === 'saveLayoutForViewport')).toBe(false);
  });

  it('sets fixed composition metadata on first install too', async () => {
    const seed = ADMIN_PAGES.find(page => page.slug === 'content' && page.lane === 'admin');
    const emitter = createSeedingEmitter();
    await seedAdminPages(emitter, 'admin-jwt', [seed]);
    expect(emitter.calls.find(call => call.eventName === 'createPage').payload.meta).toMatchObject({
      dashboardLayout: 'fixed', widgets: ['pageList'], widgetSlots: { pageList: 'page' }
    });
  });

  it('seeds Design Studio as a dedicated page-sized workspace widget', () => {
    const designPage = ADMIN_PAGES.find(page => page.slug === 'designer-layouts' && page.parentSlug === 'content');

    expect(designPage).toBeTruthy();
    expect(designPage.config.widgets).toEqual(['designerLayouts']);
    expect(designPage.config.widgetSlots).toMatchObject({
      designerLayouts: 'page'
    });
  });

  it('seeds Layouts as a dedicated page-sized workspace widget', () => {
    const layoutsPage = ADMIN_PAGES.find(page => page.slug === 'layouts' && page.parentSlug === 'content');

    expect(layoutsPage).toBeTruthy();
    expect(layoutsPage.config.widgets).toEqual(['layoutTemplates']);
    expect(layoutsPage.config.widgetSlots).toMatchObject({
      layoutTemplates: 'page'
    });
  });

  it('seeds Update Center inside the Settings workspace', () => {
    const updateCenterPage = ADMIN_PAGES.find(page => page.slug === 'updates' && page.parentSlug === 'settings');

    expect(updateCenterPage).toBeTruthy();
    expect(updateCenterPage.title).toBe('Update Center');
    expect(updateCenterPage.config.layout.sidebar).toBe('settings-sidebar');
    expect(updateCenterPage.config.icon).toBe('/assets/icons/refresh-cw.svg');
  });

  it('seeds the developer UI Kit inside the Settings workspace', () => {
    const uiKitPage = ADMIN_PAGES.find(page => page.slug === 'ui-kit' && page.parentSlug === 'settings');

    expect(uiKitPage).toBeTruthy();
    expect(uiKitPage.title).toBe('UI Kit');
    expect(uiKitPage.config.layout.sidebar).toBe('settings-sidebar');
    expect(uiKitPage.config.icon).toBe('/assets/icons/component.svg');
    expect(uiKitPage.config.widgets).toEqual([]);
  });
  it('retires the inactive Import / Export placeholder without removing module tools', async () => {
    const seed = ADMIN_PAGES.find(page => page.slug === 'import-export');
    expect(seed.retired).toBe(true);
    const emitter = createSeedingEmitter({ id: 'legacy-import', slug: 'settings/import-export', lane: 'admin', status: 'published' });
    await seedAdminPages(emitter, 'admin-jwt', [seed]);
    expect(emitter.calls.find(call => call.eventName === 'updatePage').payload).toMatchObject({ pageId: 'legacy-import', status: 'deleted' });
    expect(ADMIN_PAGES.find(page => page.slug === 'modules').retired).not.toBe(true);
  });

});
