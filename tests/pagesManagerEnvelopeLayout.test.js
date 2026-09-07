const {
  _internals: { designLayoutForPage, setupPagesManagerEvents }
} = require('../mother/modules/pagesManager');
const EventEmitter = require('events');

describe('Pages Manager public envelope layout selection', () => {
  it('rejects incomplete composition metadata before writing through either Pages action', async () => {
    const emitter = new EventEmitter();
    setupPagesManagerEvents(emitter);
    const write = jest.fn();
    emitter.on('dbUpdate', write);
    for (const action of ['createPage', 'updatePage']) {
      const error = await new Promise(resolve => emitter.emit(action, {
        jwt: 'fixture', moduleName: 'pagesManager', moduleType: 'core', pageId: 'page', title: 'Article',
        meta: { pageDesignMode: 'composed' }
      }, resolve));
      expect(error.message).toContain('PAGE_LAYOUT_DESIGN_REQUIRED');
    }
    expect(write).not.toHaveBeenCalled();
  });
  async function inheritedEnvelope(parentStatus = 'published', childMeta = { inheritParentDesign: true }, siteDesign = '') {
    const emitter = new EventEmitter();
    setupPagesManagerEvents(emitter);
    const child = { id: 'child', parent_id: 'parent', slug: 'docs/intro', title: 'Intro', lane: 'public',
      status: 'published', language: 'de', html: '<h1>Introduction</h1>', meta: childMeta };
    emitter.removeAllListeners('getPageBySlug');
    emitter.removeAllListeners('getPageById');
    emitter.on('getPageBySlug', (_payload, cb) => cb(null, child));
    emitter.on('getPageById', (payload, cb) => {
      expect(payload.language).toBe('de');
      cb(null, { id: 'parent', lane: 'public', status: parentStatus, title: 'Docs', meta: { designId: 42 } });
    });
    emitter.on('resolveSeoMeta', (_payload, cb) => cb(null, {}));
    emitter.on('getPublicSettings', (_payload, cb) => cb(null, { SITE_MAIN_DESIGN_ID: siteDesign }));
    return new Promise((resolve, reject) => emitter.emit('getEnvelope', {
      jwt: 'fixture', moduleName: 'pagesManager', moduleType: 'core', slug: child.slug, language: 'de'
    }, (error, result) => error ? reject(error) : resolve(result)));
  }

  it('resolves the published ancestor and orders structural rendering before article insertion', async () => {
    const result = await inheritedEnvelope();
    expect(result.meta.presentation).toMatchObject({ designId: '42', sourcePageId: 'parent', inherited: true });
    expect(result.attachments.map(item => item.type)).toEqual(['design', 'html', 'widgets']);
    expect([...result.attachments].sort((a, b) => a.priority - b.priority).map(item => item.type)).toEqual(['design', 'widgets', 'html']);
    expect(result.attachments[1].descriptor).toMatchObject({ contentSlot: true, inline: { html: '<h1>Introduction</h1>' } });
  });

  it('composes the site default with the explicit page design, independent of a draft parent', async () => {
    const result = await inheritedEnvelope('draft', { pageDesignMode: 'composed', designId: 'article' }, 'main');
    expect(result.meta.presentation).toMatchObject({ designId: 'main', contentDesignId: 'article', source: 'site' });
    expect(result.attachments[0].descriptor).toMatchObject({ layoutRef: 'layout:main@v1', contentLayoutRef: 'layout:article@v1', requiresContentSlot: true });
  });

  it('keeps a public HTML fallback when the parent is unpublished or inheritance is disabled', async () => {
    for (const result of [await inheritedEnvelope('draft'), await inheritedEnvelope('published', { inheritParentDesign: false })]) {
      expect(result.meta.presentation).toBeNull();
      expect(result.attachments[0].descriptor.layoutRef).toBeUndefined();
      expect(result.attachments[1].descriptor.inline.html).toContain('Introduction');
    }
  });
  it('uses a linked Design Studio id', () => {
    expect(designLayoutForPage({
      slug: 'coming-soon',
      meta: { designId: 42 }
    })).toEqual({
      layoutRef: 'layout:42@v1',
      hasLinkedDesign: true
    });
  });

  it('keeps an explicit design layout ref when one is stored on the page', () => {
    expect(designLayoutForPage({
      slug: 'landing',
      meta: JSON.stringify({ design_layout: 'layout:hero-page@v3' })
    })).toEqual({
      layoutRef: 'layout:hero-page@v3',
      hasLinkedDesign: true
    });
  });

  it('does not invent a layout reference for pages without a linked design', () => {
    expect(designLayoutForPage({
      slug: 'landing',
      meta: null
    })).toEqual({
      layoutRef: undefined,
      hasLinkedDesign: false
    });
  });
});
