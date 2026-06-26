const {
  seedAdminPages
} = require('../mother/modules/plainSpace/plainSpaceService');
const {
  ADMIN_PAGES
} = require('../mother/modules/plainSpace/config/adminPages');

function createSeedingEmitter(existingPage = null) {
  const calls = [];
  return {
    calls,
    listenerCount: eventName => (['getPageBySlug', 'createPage', 'updatePage'].includes(eventName) ? 1 : 0),
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
});
