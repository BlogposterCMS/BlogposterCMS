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
    expect(homePage.config.widgets).toEqual(['roadmapIntro', 'pageStats', 'contentSummary']);
    expect(homePage.config.retiredWidgets).toEqual(['roadmapUpcoming', 'dragbarDemo']);
    expect(homePage.config.widgetSlots).toMatchObject({
      roadmapIntro: 'half',
      pageStats: 'half',
      contentSummary: 'full'
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
      'roadmapIntro',
      'customWidget',
      'pageStats',
      'contentSummary'
    ]);

    const saveLayoutCall = emitter.calls.find(call => call.eventName === 'saveLayoutForViewport');
    expect(saveLayoutCall.payload.layout.map(entry => entry.widgetId)).toEqual([
      'roadmapIntro',
      'customWidget',
      'pageStats',
      'contentSummary'
    ]);
    expect(saveLayoutCall.payload.layout.find(entry => entry.widgetId === 'pageStats').slot).toBe('half');
    expect(saveLayoutCall.payload.layout.find(entry => entry.widgetId === 'contentSummary').slot).toBe('full');
  });

  it('uses page management as the Content workspace entry point', () => {
    const contentPage = ADMIN_PAGES.find(page => page.slug === 'content' && page.lane === 'admin');

    expect(contentPage).toBeTruthy();
    expect(contentPage.config.widgets).toEqual(['pageList', 'pageStats', 'contentSummary']);
    expect(contentPage.config.widgetSlots).toMatchObject({
      pageList: 'twoThird',
      pageStats: 'third',
      contentSummary: 'full'
    });
    expect(contentPage.config.actionButton.action).toBe('createNewPage');
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
});
