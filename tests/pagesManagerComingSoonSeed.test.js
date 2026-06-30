const {
  COMING_SOON_SEED_KEY,
  COMING_SOON_SEED_VERSION,
  COMING_SOON_SLUG,
  comingSoonDesignPayload,
  comingSoonTranslation,
  seedComingSoonPage
} = require('../mother/modules/pagesManager/comingSoonSeed');

function createEmitter({ existingPage = null, designResult = { id: 'design-1', version: 1 } } = {}) {
  const calls = [];
  const listeners = new Set([
    'getPageBySlug',
    'createPage',
    'updatePage',
    'designer.saveDesign',
    'setSetting'
  ]);

  return {
    calls,
    listenerCount: eventName => (listeners.has(eventName) ? 1 : 0),
    emit(eventName, payload, callback) {
      calls.push({ eventName, payload });
      if (!listeners.has(eventName)) return false;
      if (eventName === 'getPageBySlug') {
        callback(null, existingPage);
        return true;
      }
      if (eventName === 'createPage') {
        callback(null, { pageId: 'page-1' });
        return true;
      }
      if (eventName === 'designer.saveDesign') {
        callback(null, designResult);
        return true;
      }
      if (eventName === 'updatePage') {
        callback(null, { done: true });
        return true;
      }
      if (eventName === 'setSetting') {
        callback(null, { done: true });
        return true;
      }
      return false;
    }
  };
}

function callsFor(emitter, eventName) {
  return emitter.calls.filter(call => call.eventName === eventName);
}

describe('Pages Manager Coming Soon seed', () => {
  it('creates a seed page, saves a Design Studio design and enables maintenance settings on empty installs', async () => {
    const emitter = createEmitter();

    const result = await seedComingSoonPage(emitter, 'pages-jwt', {
      enableMaintenanceMode: true
    });

    expect(result).toMatchObject({
      pageId: 'page-1',
      created: true,
      designId: 'design-1'
    });

    const createCall = callsFor(emitter, 'createPage')[0];
    expect(createCall.payload.slug).toBe(COMING_SOON_SLUG);
    expect(createCall.payload.meta.seedKey).toBe(COMING_SOON_SEED_KEY);
    expect(createCall.payload.meta.seedVersion).toBe(COMING_SOON_SEED_VERSION);
    expect(createCall.payload.translations[0].html).toContain('Design Studio Tech Preview');

    const designCall = callsFor(emitter, 'designer.saveDesign')[0];
    expect(designCall.payload.design.title).toBe('System / Coming Soon');
    expect(designCall.payload.design.description).toContain('tech preview');
    expect(designCall.payload.layout.nodeId).toBe('coming-soon-workarea');
    expect(designCall.payload.widgets.map(widget => widget.widgetId)).toEqual([
      'textBox',
      'textBox',
      'textBox',
      'textBox',
      'textBox',
      'textBox',
      'buttonLink',
      'textBox'
    ]);

    const updateCall = callsFor(emitter, 'updatePage')[0];
    expect(updateCall.payload.pageId).toBe('page-1');
    expect(updateCall.payload.meta.designId).toBe('design-1');
    expect(updateCall.payload.meta.inheritParentDesign).toBe(false);
    expect(updateCall.payload.meta.seedVersion).toBe(COMING_SOON_SEED_VERSION);

    const settings = callsFor(emitter, 'setSetting').map(call => [call.payload.key, call.payload.value]);
    expect(settings).toContainEqual(['MAINTENANCE_PAGE_ID', 'page-1']);
    expect(settings).toContainEqual(['MAINTENANCE_MODE', 'true']);
  });

  it('upgrades the retired raw HTML seed without creating a duplicate page', async () => {
    const emitter = createEmitter({
      existingPage: {
        id: 'retired-seed-page',
        slug: COMING_SOON_SLUG,
        title: 'Coming Soon',
        html: '<h1>Site Under Maintenance</h1><p>We\'ll be back shortly.</p>',
        meta: null
      }
    });

    const result = await seedComingSoonPage(emitter, 'pages-jwt');

    expect(result).toMatchObject({
      pageId: 'retired-seed-page',
      created: false,
      upgraded: true,
      designId: 'design-1'
    });
    expect(callsFor(emitter, 'createPage')).toHaveLength(0);
    expect(callsFor(emitter, 'designer.saveDesign')).toHaveLength(1);
    expect(callsFor(emitter, 'updatePage')[0].payload.meta.seedKey).toBe(COMING_SOON_SEED_KEY);
  });

  it('refreshes older seed-managed designs without touching custom pages', async () => {
    const emitter = createEmitter({
      existingPage: {
        id: 'seed-page',
        slug: COMING_SOON_SLUG,
        title: 'Coming Soon',
        html: comingSoonTranslation().html,
        meta: {
          seedKey: COMING_SOON_SEED_KEY,
          seedVersion: 1,
          designId: 'old-design'
        }
      }
    });

    const result = await seedComingSoonPage(emitter, 'pages-jwt');

    expect(result).toMatchObject({
      pageId: 'seed-page',
      created: false,
      upgraded: true,
      designId: 'design-1'
    });
    expect(callsFor(emitter, 'designer.saveDesign')).toHaveLength(1);
    expect(callsFor(emitter, 'updatePage')[0].payload.meta).toMatchObject({
      designId: 'design-1',
      seedKey: COMING_SOON_SEED_KEY,
      seedVersion: COMING_SOON_SEED_VERSION
    });
  });

  it('does not overwrite a custom coming-soon page when it is not seed-managed', async () => {
    const emitter = createEmitter({
      existingPage: {
        id: 'custom-page',
        slug: COMING_SOON_SLUG,
        title: 'Coming Soon',
        html: '<h1>Custom launch page</h1>',
        meta: { owner: 'user' }
      }
    });

    const result = await seedComingSoonPage(emitter, 'pages-jwt');

    expect(result).toMatchObject({
      pageId: 'custom-page',
      created: false,
      designSkipped: true,
      designSkipReason: 'not-seed-owned'
    });
    expect(callsFor(emitter, 'createPage')).toHaveLength(0);
    expect(callsFor(emitter, 'designer.saveDesign')).toHaveLength(0);
    expect(callsFor(emitter, 'updatePage')).toHaveLength(0);
    expect(callsFor(emitter, 'setSetting')).toHaveLength(0);
  });

  it('builds a runtime design document with instance metadata instead of inline widget HTML', () => {
    const payload = comingSoonDesignPayload();

    expect(payload.layout).toMatchObject({
      type: 'leaf',
      workarea: true,
      settings: { mode: 'free', minHeight: '100vh' }
    });
    expect(payload.design.description).toContain('tech preview');
    expect(payload.widgets).toHaveLength(8);
    expect(payload.widgets.every(widget => !widget.code.html)).toBe(true);
    expect(payload.widgets.every(widget => widget.code.meta.workareaId === 'coming-soon-workarea')).toBe(true);
    expect(payload.widgets.find(widget => widget.id === 'coming-soon-login-link').code.meta).toMatchObject({
      label: 'Open admin',
      settings: {
        label: 'Open admin',
        href: '/login',
        variant: 'primary'
      }
    });
  });
});
