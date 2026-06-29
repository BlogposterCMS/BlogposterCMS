const assert = require('assert');
const EventEmitter = require('events');
const express = require('express');
const axios = require('axios');

const {
  _internals: {
    registerPublicRuntimeRoutes,
    runScheduledPublisherOnce,
    setupRuntimeEvents,
    shouldCheckRedirect
  }
} = require('../mother/modules/runtimeManager');

function startApp(app) {
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('runtime redirect middleware resolves public redirects and skips admin/api paths', async () => {
  const app = express();
  const emitter = new EventEmitter();
  const seen = [];

  emitter.on('generateSeoSitemap', (_payload, cb) => cb(null, '<urlset></urlset>'));
  emitter.on('generateRobotsTxt', (_payload, cb) => cb(null, 'User-agent: *\nAllow: /\n'));
  emitter.on('resolveRedirect', (payload, cb) => {
    seen.push(payload.path);
    if (payload.path === '/old/team') {
      cb(null, { target: '/new/team', statusCode: 308 });
      return;
    }
    cb(null, null);
  });

  registerPublicRuntimeRoutes(app, emitter, 'runtime-token');
  app.get('/api/health', (_req, res) => res.send('ok'));
  app.get('/new/team', (_req, res) => res.send('new'));

  const server = await startApp(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const redirected = await axios.get(`${base}/old/team`, {
      maxRedirects: 0,
      validateStatus: () => true
    });
    assert.strictEqual(redirected.status, 308);
    assert.strictEqual(redirected.headers.location, '/new/team');
    assert(seen.includes('/old/team'));

    const health = await axios.get(`${base}/api/health`);
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.data, 'ok');
    assert(!seen.includes('/api/health'));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('runtime manager serves sitemap and robots from SEO events', async () => {
  const app = express();
  const emitter = new EventEmitter();

  emitter.on('generateSeoSitemap', (payload, cb) => {
    assert.strictEqual(payload.moduleName, 'seoManager');
    assert.strictEqual(payload.jwt, 'runtime-token');
    assert.match(payload.baseUrl, /^http:\/\/127\.0\.0\.1:/);
    cb(null, '<urlset><url><loc>http://example.test/</loc></url></urlset>');
  });
  emitter.on('generateRobotsTxt', (payload, cb) => {
    assert.strictEqual(payload.moduleName, 'seoManager');
    cb(null, 'User-agent: *\nSitemap: http://example.test/sitemap.xml\n');
  });
  emitter.on('resolveRedirect', (_payload, cb) => cb(null, null));

  registerPublicRuntimeRoutes(app, emitter, 'runtime-token');

  const server = await startApp(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const sitemap = await axios.get(`${base}/sitemap.xml`);
    assert.strictEqual(sitemap.status, 200);
    assert.match(sitemap.headers['content-type'], /application\/xml/);
    assert.match(sitemap.data, /<urlset>/);

    const robots = await axios.get(`${base}/robots.txt`);
    assert.strictEqual(robots.status, 200);
    assert.match(robots.headers['content-type'], /text\/plain/);
    assert.match(robots.data, /User-agent/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('runtime public search API forces published public results', async () => {
  const app = express();
  const emitter = new EventEmitter();
  let payloadSeen = null;

  emitter.on('searchDocuments', (payload, cb) => {
    payloadSeen = payload;
    cb(null, [
      {
        id: 'doc-live',
        entryId: 'entry-live',
        sourceModule: 'contentEngine',
        sourceId: 'entry-live',
        contentTypeKey: 'post',
        title: 'Live Post',
        excerpt: 'Visible',
        url: '/blog/live',
        language: 'en',
        status: 'published',
        visibility: 'public',
        meta: { publicLabel: 'visible', secretNote: 'hidden' }
      },
      {
        id: 'doc-private',
        title: 'Private Post',
        status: 'draft',
        visibility: 'private'
      }
    ]);
  });

  registerPublicRuntimeRoutes(app, emitter, 'runtime-token');

  const server = await startApp(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const result = await axios.get(`${base}/api/public/search`, {
      params: { q: 'live', type: 'post', limit: 3, offset: 1 }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(payloadSeen.moduleName, 'searchManager');
    assert.deepStrictEqual(payloadSeen.decodedJWT, { permissions: {} });
    assert.strictEqual(payloadSeen.status, 'published');
    assert.strictEqual(payloadSeen.visibility, 'public');
    assert.strictEqual(payloadSeen.contentTypeKey, 'post');
    assert.strictEqual(payloadSeen.limit, 3);
    assert.strictEqual(payloadSeen.offset, 1);
    assert.strictEqual(result.data.results.length, 1);
    assert.strictEqual(result.data.results[0].id, 'doc-live');
    assert.strictEqual(result.data.results[0].meta.publicLabel, 'visible');
    assert.strictEqual(result.data.results[0].meta.secretNote, undefined);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('runtime public content API only exposes published entries', async () => {
  const app = express();
  const emitter = new EventEmitter();
  const listPayloads = [];

  emitter.on('resolveContentPermalink', (payload, cb) => {
    if (payload.permalink === '/blog/live') {
      cb(null, {
        id: 'entry-live',
        content_type_key: 'post',
        slug: 'live',
        permalink: '/blog/live',
        status: 'published',
        title: 'Live Post',
        language: payload.language,
        excerpt: 'Visible excerpt',
        content: { html: '<p>Hello</p>' },
        meta: {
          publicLabel: 'visible',
          passwordToken: 'hidden',
          _internalNote: 'hidden'
        }
      });
      return;
    }
    if (payload.permalink === '/blog/draft') {
      cb(null, { id: 'entry-draft', status: 'draft', title: 'Draft Post' });
      return;
    }
    cb(null, null);
  });
  emitter.on('listContentEntries', (payload, cb) => {
    listPayloads.push(payload);
    cb(null, [
      { id: 'entry-live', content_type_key: 'post', permalink: '/blog/live', status: 'published', title: 'Live Post' },
      { id: 'entry-draft', content_type_key: 'post', permalink: '/blog/draft', status: 'draft', title: 'Draft Post' }
    ]);
  });
  emitter.on('resolveSeoMeta', (_payload, cb) => cb(null, { seo: { title: 'SEO Live' } }));

  registerPublicRuntimeRoutes(app, emitter, 'runtime-token');

  const server = await startApp(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const live = await axios.get(`${base}/api/public/content`, {
      params: { path: '/blog/live', lang: 'en' }
    });
    assert.strictEqual(live.status, 200);
    assert.strictEqual(live.data.entry.title, 'Live Post');
    assert.strictEqual(live.data.entry.meta.publicLabel, 'visible');
    assert.strictEqual(live.data.entry.meta.passwordToken, undefined);
    assert.strictEqual(live.data.entry.meta._internalNote, undefined);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(live.data, 'terms'), false);
    assert.strictEqual(live.data.seo.title, 'SEO Live');

    const draft = await axios.get(`${base}/api/public/content`, {
      params: { path: '/blog/draft' },
      validateStatus: () => true
    });
    assert.strictEqual(draft.status, 404);

    const listed = await axios.get(`${base}/api/public/content/post`, {
      params: { limit: 9, offset: 2 }
    });
    assert.strictEqual(listed.status, 200);
    assert.strictEqual(listed.data.entries.length, 1);
    assert.strictEqual(listed.data.entries[0].id, 'entry-live');
    assert.strictEqual(listPayloads[0].moduleName, 'contentEngine');
    assert.strictEqual(listPayloads[0].contentTypeKey, 'post');
    assert.strictEqual(listPayloads[0].status, 'published');
    assert.strictEqual(listPayloads[0].limit, 9);
    assert.strictEqual(listPayloads[0].offset, 2);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('runtime public comments API lists approved comments and creates pending comments', async () => {
  const app = express();
  app.use(express.json());
  const emitter = new EventEmitter();
  const listPayloads = [];
  const createPayloads = [];

  emitter.on('getContentEntry', (payload, cb) => {
    if (payload.entryId === 'entry-live') {
      cb(null, { id: 'entry-live', status: 'published' });
      return;
    }
    if (payload.entryId === 'entry-draft') {
      cb(null, { id: 'entry-draft', status: 'draft' });
      return;
    }
    cb(null, null);
  });
  emitter.on('listCommentsForEntry', (payload, cb) => {
    listPayloads.push(payload);
    cb(null, [
      {
        id: 'comment-approved',
        entryId: payload.entryId,
        authorName: 'Ada',
        authorEmail: 'ada@example.test',
        authorIpHash: 'hidden',
        content: 'Looks good',
        status: 'approved',
        meta: { publicFlag: 'yes', privateToken: 'hidden' }
      },
      {
        id: 'comment-spam',
        entryId: payload.entryId,
        authorName: 'Spam',
        content: 'Nope',
        status: 'spam'
      }
    ]);
  });
  emitter.on('createComment', (payload, cb) => {
    createPayloads.push(payload);
    cb(null, {
      id: 'comment-pending',
      entryId: payload.entryId,
      authorName: payload.authorName,
      content: payload.content,
      status: 'pending'
    });
  });

  registerPublicRuntimeRoutes(app, emitter, 'runtime-token');

  const server = await startApp(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const listed = await axios.get(`${base}/api/public/comments`, {
      params: { entryId: 'entry-live', limit: 4 }
    });
    assert.strictEqual(listed.status, 200);
    assert.strictEqual(listPayloads[0].moduleName, 'commentsManager');
    assert.deepStrictEqual(listPayloads[0].decodedJWT, { permissions: {} });
    assert.strictEqual(listPayloads[0].status, 'approved');
    assert.strictEqual(listed.data.comments.length, 1);
    assert.strictEqual(listed.data.comments[0].authorEmail, undefined);
    assert.strictEqual(listed.data.comments[0].meta.publicFlag, 'yes');
    assert.strictEqual(listed.data.comments[0].meta.privateToken, undefined);

    const draft = await axios.get(`${base}/api/public/comments`, {
      params: { entryId: 'entry-draft' },
      validateStatus: () => true
    });
    assert.strictEqual(draft.status, 404);

    const created = await axios.post(`${base}/api/public/comments`, {
      entryId: 'entry-live',
      authorName: 'Grace',
      authorEmail: 'grace@example.test',
      content: 'Please review',
      status: 'approved'
    });
    assert.strictEqual(created.status, 201);
    assert.strictEqual(createPayloads[0].moduleName, 'commentsManager');
    assert.deepStrictEqual(createPayloads[0].decodedJWT, { permissions: { comments: { create: true } } });
    assert.strictEqual(createPayloads[0].status, 'pending');
    assert.strictEqual(created.data.comment.status, 'pending');
    assert.strictEqual(created.data.comment.authorEmail, undefined);
    assert.strictEqual(created.data.moderation, 'pending');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('runtime preview token event and route expose draft previews with autosave overlay', async () => {
  const app = express();
  const emitter = new EventEmitter();
  setupRuntimeEvents(emitter);
  const entryLookups = [];
  const autosaveLookups = [];

  emitter.on('getContentEntry', (payload, cb) => {
    entryLookups.push(payload);
    if (payload.entryId === 'entry-draft') {
      cb(null, {
        id: 'entry-draft',
        content_type_key: 'post',
        slug: 'draft',
        permalink: '/post/draft',
        status: 'draft',
        title: 'Draft Title',
        language: 'en',
        excerpt: 'Draft excerpt',
        content: { html: '<p>Draft</p>' },
        meta: { publicLabel: 'entry', secretToken: 'hidden' }
      });
      return;
    }
    cb(null, null);
  });
  emitter.on('getContentAutosave', (payload, cb) => {
    autosaveLookups.push(payload);
    cb(null, {
      id: 'autosave-1',
      targetType: 'contentEntry',
      targetId: payload.entryId,
      title: 'Autosaved Title',
      excerpt: 'Autosaved excerpt',
      content: { html: '<p>Autosave</p>' },
      meta: { publicLabel: 'autosave', privateToken: 'hidden' },
      updatedAt: '2030-01-01T00:00:00.000Z'
    });
  });
  emitter.on('resolveSeoMeta', (_payload, cb) => cb(null, { seo: { title: 'Preview SEO' } }));

  registerPublicRuntimeRoutes(app, emitter, 'runtime-token');

  const tokenResult = await new Promise((resolve, reject) => {
    emitter.emit('createContentPreviewToken', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT: { permissions: { content: { update: true } }, userId: 'user-1' },
      entryId: 'entry-draft',
      useAutosave: true,
      ttlSeconds: 120
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });

  assert.match(tokenResult.token, /^[^.]+\.[^.]+$/);
  assert.match(tokenResult.previewUrl, /^\/api\/public\/preview\?token=/);
  assert.strictEqual(tokenResult.entry.title, 'Draft Title');

  const facadeToken = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT: { permissions: { content: { update: true } }, userId: 'user-1' },
      resource: 'preview',
      action: 'token',
      params: {
        entryId: 'entry-draft',
        ttlSeconds: 120
      }
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });

  assert.strictEqual(facadeToken.eventName, 'createContentPreviewToken');
  assert.match(facadeToken.data.previewUrl, /^\/api\/public\/preview\?token=/);
  assert.strictEqual(facadeToken.data.entry.title, 'Draft Title');

  const server = await startApp(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const preview = await axios.get(`${base}${tokenResult.previewUrl}`);
    assert.strictEqual(preview.status, 200);
    assert.strictEqual(preview.headers['cache-control'], 'no-store');
    assert.strictEqual(preview.data.entry.title, 'Autosaved Title');
    assert.strictEqual(preview.data.entry.content.html, '<p>Autosave</p>');
    assert.strictEqual(preview.data.entry.meta.publicLabel, 'autosave');
    assert.strictEqual(preview.data.entry.meta.privateToken, undefined);
    assert.strictEqual(preview.data.preview.source, 'autosave');
    assert.strictEqual(preview.data.preview.entryId, 'entry-draft');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(preview.data, 'terms'), false);
    assert.strictEqual(preview.data.seo.title, 'Preview SEO');
    assert.strictEqual(entryLookups[0].moduleName, 'contentEngine');
    assert.strictEqual(autosaveLookups[0].moduleName, 'workflowManager');

    const missingToken = await axios.get(`${base}/api/public/preview`, {
      validateStatus: () => true
    });
    assert.strictEqual(missingToken.status, 401);

    const badToken = await axios.get(`${base}/api/public/preview`, {
      params: { token: 'bad.token' },
      validateStatus: () => true
    });
    assert.strictEqual(badToken.status, 401);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('runtime preview token event requires content update permission', async () => {
  const emitter = new EventEmitter();
  setupRuntimeEvents(emitter);

  const denied = await new Promise(resolve => {
    emitter.emit('createContentPreviewToken', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT: { permissions: { content: { create: true } } },
      entryId: 'entry-draft'
    }, (err, result) => resolve({ err, result }));
  });

  assert(denied.err);
  assert.match(denied.err.message, /content\.update/);
});

test('runtime public facade dispatches only public runtime reads through core contracts', async () => {
  const emitter = new EventEmitter();
  setupRuntimeEvents(emitter, 'runtime-core-token');
  const routed = [];

  const publicHome = {
    id: 'page-home',
    slug: 'home',
    lane: 'public',
    status: 'published',
    title: 'Home',
    html: '<p>Hello</p>',
    meta: {
      layoutTemplate: 'landing',
      secretToken: 'hidden',
      _private: true
    }
  };

  emitter.on('getStartPage', (payload, cb) => {
    routed.push({ eventName: 'getStartPage', payload });
    cb(null, publicHome);
  });
  emitter.on('getPageBySlug', (payload, cb) => {
    routed.push({ eventName: 'getPageBySlug', payload });
    if (payload.slug === 'draft') {
      cb(null, { ...publicHome, slug: 'draft', status: 'draft' });
      return;
    }
    cb(null, publicHome);
  });
  emitter.on('getEnvelope', (payload, cb) => {
    routed.push({ eventName: 'getEnvelope', payload });
    cb(null, { slug: payload.slug, lane: 'public', attachments: [] });
  });
  emitter.on('getChildPages', (payload, cb) => {
    routed.push({ eventName: 'getChildPages', payload });
    cb(null, [
      { ...publicHome, id: 'child-public', slug: 'child-public' },
      { ...publicHome, id: 'child-draft', slug: 'child-draft', status: 'draft' },
      { ...publicHome, id: 'child-admin', slug: 'child-admin', lane: 'admin' }
    ]);
  });
  emitter.on('getWidgets', (payload, cb) => {
    routed.push({ eventName: 'getWidgets', payload });
    cb(null, [
      { widgetId: 'hero', widgetType: 'public' },
      { widgetId: 'adminOnly', widgetType: 'admin' }
    ]);
  });
  emitter.on('widget.registry.request.v1', (payload, cb) => {
    routed.push({ eventName: 'widget.registry.request.v1', payload });
    cb(null, { widgets: [{ id: 'hero', lane: payload.lane }] });
  });
  emitter.on('getLayoutForViewport', (payload, cb) => {
    routed.push({ eventName: 'getLayoutForViewport', payload });
    cb(null, {
      layout: [
        { widgetId: 'hero', lane: payload.lane },
        { widgetId: 'adminOnly', lane: 'admin', privateToken: 'hidden' }
      ],
      privateToken: 'hidden'
    });
  });
  emitter.on('getGlobalLayoutTemplate', (payload, cb) => {
    routed.push({ eventName: 'getGlobalLayoutTemplate', payload });
    cb(null, {
      name: 'global-layout',
      lane: payload.lane || 'admin',
      layout: [
        { widgetId: 'hero', lane: 'public', meta: { label: 'visible', secretToken: 'hidden' } },
        { widgetId: 'adminOnly', lane: 'admin' }
      ],
      meta: { publicLabel: 'visible', secretKey: 'hidden' },
      privateToken: 'hidden'
    });
  });
  emitter.on('getWidgetInstance', (payload, cb) => {
    routed.push({ eventName: 'getWidgetInstance', payload });
    cb(null, { content: '{"height":40}' });
  });
  emitter.on('designer.getDesign', (payload, cb) => {
    routed.push({ eventName: 'designer.getDesign', payload });
    if (payload.id === 'draft-design') {
      cb(null, {
        design: {
          id: 'draft-design',
          title: 'Draft',
          is_draft: true,
          owner_id: 'author-1'
        },
        widgets: []
      });
      return;
    }
    cb(null, {
      design: {
        id: payload.id,
        title: 'Hero',
        is_draft: false,
        owner_id: 'author-1',
        ownerId: 'author-2'
      },
      widgets: [{ id: 'widget-1' }]
    });
  });
  emitter.on('designer.getLayout', (payload, cb) => {
    routed.push({ eventName: 'designer.getLayout', payload });
    cb(null, {
      grid: { columns: 12, cellHeight: 10 },
      items: [
        {
          instanceId: 'instance-1',
          widgetId: 'hero',
          xPercent: 0,
          yPercent: 5,
          wPercent: 100,
          hPercent: 25,
          privateToken: 'hidden'
        }
      ],
      layoutRef: payload.layoutRef,
      privateToken: 'hidden'
    });
  });

  const decodedJWT = { isPublic: true, purpose: 'public' };
  const call = (resource, action, params = {}) => new Promise((resolve, reject) => {
    emitter.emit('cmsPublicRuntimeRequest', {
      jwt: 'public-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource,
      action,
      params
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });

  const start = await call('pages', 'start', { language: 'en' });
  assert.strictEqual(start.eventName, 'getStartPage');
  assert.strictEqual(start.data.slug, 'home');
  assert.strictEqual(start.data.html, '<p>Hello</p>');
  assert.strictEqual(start.data.meta.layoutTemplate, 'landing');
  assert.strictEqual(start.data.meta.secretToken, undefined);
  assert.strictEqual(routed[0].payload.jwt, 'runtime-core-token');

  const draft = await call('pages', 'getBySlug', { slug: 'draft', lane: 'public' });
  assert.strictEqual(draft.data, null);

  const envelope = await call('pages', 'envelope', { slug: 'home' });
  assert.strictEqual(envelope.eventName, 'getEnvelope');
  assert.strictEqual(envelope.data.slug, 'home');

  const children = await call('pages', 'children', { parentId: 'page-home' });
  assert.strictEqual(children.data.length, 1);
  assert.strictEqual(children.data[0].slug, 'child-public');

  const widgets = await call('widgets', 'list', { widgetType: 'admin' });
  assert.strictEqual(widgets.eventName, 'getWidgets');
  assert.deepStrictEqual(widgets.data, [{ widgetId: 'hero', widgetType: 'public' }]);

  const registry = await call('plainSpace', 'widgetRegistry', { lane: 'admin' });
  assert.strictEqual(registry.eventName, 'widget.registry.request.v1');
  assert.strictEqual(routed.find(entry => entry.eventName === 'widget.registry.request.v1').payload.lane, 'public');

  const layout = await call('plainSpace', 'layoutForViewport', {
    pageId: 'page-home',
    lane: 'admin',
    viewport: 'desktop'
  });
  assert.strictEqual(layout.eventName, 'getLayoutForViewport');
  assert.strictEqual(layout.data.privateToken, undefined);
  assert.strictEqual(layout.data.layout.length, 1);
  assert.strictEqual(layout.data.layout[0].lane, 'public');

  const globalTemplate = await call('plainSpace', 'globalLayoutTemplate', { lane: 'admin' });
  assert.strictEqual(globalTemplate.eventName, 'getGlobalLayoutTemplate');
  const globalPayload = routed.find(entry => entry.eventName === 'getGlobalLayoutTemplate').payload;
  assert.strictEqual(globalPayload.lane, 'public');
  assert.strictEqual(globalTemplate.data.lane, 'public');
  assert.strictEqual(globalTemplate.data.privateToken, undefined);
  assert.strictEqual(globalTemplate.data.meta.publicLabel, 'visible');
  assert.strictEqual(globalTemplate.data.meta.secretKey, undefined);
  assert.deepStrictEqual(globalTemplate.data.layout.map(item => item.widgetId), ['hero']);
  assert.strictEqual(globalTemplate.data.layout[0].meta.secretToken, undefined);

  const widgetInstance = await call('plainSpace', 'widgetInstance', { instanceId: 'default.hero' });
  assert.strictEqual(widgetInstance.eventName, 'getWidgetInstance');
  assert.strictEqual(widgetInstance.data.content, '{"height":40}');

  const design = await call('designer', 'get', { id: 'design-1' });
  assert.strictEqual(design.eventName, 'designer.getDesign');
  assert.strictEqual(design.data.design.id, 'design-1');
  assert.strictEqual(design.data.design.title, 'Hero');
  assert.strictEqual(design.data.design.owner_id, undefined);
  assert.strictEqual(design.data.design.ownerId, undefined);
  assert.strictEqual(design.data.widgets.length, 1);
  assert.strictEqual(routed.find(entry => entry.eventName === 'designer.getDesign').payload.jwt, 'runtime-core-token');

  const designLayout = await call('designer', 'getLayout', { layoutRef: 'layout:design-1@v1', id: 'ignored' });
  assert.strictEqual(designLayout.eventName, 'designer.getLayout');
  assert.strictEqual(designLayout.data.layoutRef, 'layout:design-1@v1');
  assert.strictEqual(designLayout.data.grid.cellHeight, 10);
  assert.deepStrictEqual(designLayout.data.items, [{
    instanceId: 'instance-1',
    widgetId: 'hero',
    xPercent: 0,
    yPercent: 5,
    wPercent: 100,
    hPercent: 25
  }]);
  assert.strictEqual(designLayout.data.privateToken, undefined);
  assert.strictEqual(designLayout.data.items[0].privateToken, undefined);
  const designLayoutPayload = routed.find(entry => entry.eventName === 'designer.getLayout').payload;
  assert.strictEqual(designLayoutPayload.jwt, 'runtime-core-token');
  assert.deepStrictEqual(Object.keys(designLayoutPayload).sort(), ['jwt', 'layoutRef', 'moduleName', 'moduleType'].sort());

  const draftDesign = await call('designer', 'get', { id: 'draft-design' });
  assert.strictEqual(draftDesign.eventName, 'designer.getDesign');
  assert.strictEqual(draftDesign.data, null);

  const deniedDesign = await new Promise(resolve => {
    emitter.emit('cmsPublicRuntimeRequest', {
      jwt: 'public-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'designer',
      action: 'get',
      params: {}
    }, (err, result) => resolve({ err, result }));
  });
  assert(deniedDesign.err);
  assert.match(deniedDesign.err.message, /Public design id/);

  const deniedInstance = await new Promise(resolve => {
    emitter.emit('cmsPublicRuntimeRequest', {
      jwt: 'public-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'plainSpace',
      action: 'widgetInstance',
      params: { instanceId: 'custom.secret' }
    }, (err, result) => resolve({ err, result }));
  });
  assert(deniedInstance.err);
  assert.match(deniedInstance.err.message, /default widget instances/);

  const deniedAction = await new Promise(resolve => {
    emitter.emit('cmsPublicRuntimeRequest', {
      jwt: 'public-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'plainSpace',
      action: 'saveLayoutForViewport',
      params: { layout: [] }
    }, (err, result) => resolve({ err, result }));
  });
  assert(deniedAction.err);
  assert.match(deniedAction.err.message, /Unknown CMS public runtime action/);
});

test('runtime CMS admin facade dispatches allowlisted module actions', async () => {
  const emitter = new EventEmitter();
  setupRuntimeEvents(emitter);
  const routed = [];

  emitter.on('listContentEntries', (payload, cb) => {
    routed.push({ eventName: 'listContentEntries', payload });
    cb(null, [{ id: 'entry-1', title: 'Draft', status: 'draft' }]);
  });
  emitter.on('listMediaAttachments', (payload, cb) => {
    routed.push({ eventName: 'listMediaAttachments', payload });
    cb(null, [{ id: 'media-1', title: 'Hero', visibility: 'private' }]);
  });
  emitter.on('saveContentAutosave', (payload, cb) => {
    routed.push({ eventName: 'saveContentAutosave', payload });
    cb(null, { id: 'autosave-1', title: payload.title });
  });
  emitter.on('listSettings', (payload, cb) => {
    routed.push({ eventName: 'listSettings', payload });
    cb(null, [{ key: 'SITE_TITLE', value: 'Blogposter' }]);
  });
  emitter.on('listThemes', (payload, cb) => {
    routed.push({ eventName: 'listThemes', payload });
    cb(null, [{ slug: 'default', name: 'Default Theme' }]);
  });
  emitter.on('listTranslatedTexts', (payload, cb) => {
    routed.push({ eventName: 'listTranslatedTexts', payload });
    cb(null, [{ id: 'translation-1', language_code: payload.languageCode, text_value: 'Hallo' }]);
  });
  emitter.on('getModuleSettings', (payload, cb) => {
    routed.push({ eventName: 'getModuleSettings', payload });
    cb(null, { moduleName: payload.targetModule, schema: { label: 'SEO' }, settings: { enabled: true } });
  });

  const decodedJWT = {
    permissions: {
      content: { update: true },
      settings: { core: { view: true }, unified: { viewSettings: true } },
      themes: { list: true },
      translations: { read: true },
      media: { manage: true }
    },
    userId: 'editor-1'
  };

  const list = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'content',
      action: 'list',
      params: { contentTypeKey: 'post', status: 'draft', limit: 5 }
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(list.resource, 'content');
  assert.strictEqual(list.action, 'list');
  assert.strictEqual(list.eventName, 'listContentEntries');
  assert.strictEqual(list.data[0].id, 'entry-1');
  assert.strictEqual(routed[0].payload.moduleName, 'contentEngine');
  assert.strictEqual(routed[0].payload.moduleType, 'core');
  assert.strictEqual(routed[0].payload.jwt, 'admin-token');
  assert.strictEqual(routed[0].payload.decodedJWT, decodedJWT);
  assert.strictEqual(routed[0].payload.limit, 5);

  const media = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'media',
      action: 'list',
      params: { visibility: 'private' }
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(media.eventName, 'listMediaAttachments');
  assert.strictEqual(routed[1].payload.moduleName, 'mediaManager');
  assert.strictEqual(routed[1].payload.visibility, 'private');

  const autosave = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'workflow',
      action: 'saveAutosave',
      params: { entryId: 'entry-1', title: 'Autosaved' }
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(autosave.eventName, 'saveContentAutosave');
  assert.strictEqual(routed[2].payload.moduleName, 'workflowManager');
  assert.strictEqual(routed[2].payload.title, 'Autosaved');

  const deniedTaxonomies = await new Promise(resolve => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'taxonomies',
      action: 'listTerms'
    }, (err, result) => resolve({ err, result }));
  });
  assert(deniedTaxonomies.err);
  assert.match(deniedTaxonomies.err.message, /Unknown CMS admin API action: taxonomies\.listTerms/);

  const settings = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'settings',
      action: 'list',
      params: { prefix: 'SITE_' }
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(settings.eventName, 'listSettings');
  assert.strictEqual(settings.data[0].key, 'SITE_TITLE');
  assert.strictEqual(routed[3].payload.moduleName, 'settingsManager');
  assert.strictEqual(routed[3].payload.prefix, 'SITE_');

  const themes = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'themes',
      action: 'list'
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(themes.eventName, 'listThemes');
  assert.strictEqual(themes.data[0].slug, 'default');
  assert.strictEqual(routed[4].payload.moduleName, 'themeManager');

  const translations = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'translations',
      action: 'list',
      params: { objectId: 'entry-1', languageCode: 'de' }
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(translations.eventName, 'listTranslatedTexts');
  assert.strictEqual(translations.data[0].language_code, 'de');
  assert.strictEqual(routed[5].payload.moduleName, 'translationManager');
  assert.strictEqual(routed[5].payload.objectId, 'entry-1');
  assert.strictEqual(routed[5].payload.languageCode, 'de');

  const unifiedSettings = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'unifiedSettings',
      action: 'bundle',
      params: { targetModule: 'seoManager' }
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(unifiedSettings.eventName, 'getModuleSettings');
  assert.strictEqual(unifiedSettings.data.moduleName, 'seoManager');
  assert.strictEqual(routed[6].payload.moduleName, 'unifiedSettings');
  assert.strictEqual(routed[6].payload.targetModule, 'seoManager');
});

test('runtime CMS admin facade dispatches comments metadata redirects and search actions', async () => {
  const emitter = new EventEmitter();
  setupRuntimeEvents(emitter);
  const routed = [];

  const route = (eventName, result) => {
    emitter.on(eventName, (payload, cb) => {
      routed.push({ eventName, payload });
      cb(null, typeof result === 'function' ? result(payload) : result);
    });
  };

  route('listCommentsForEntry', payload => [{ id: 'comment-1', entryId: payload.entryId }]);
  route('updateCommentStatus', payload => ({ updated: true, status: payload.status }));
  route('getMetadataValue', payload => `meta:${payload.metaKey}`);
  route('setMetadata', payload => ({ targetId: payload.targetId, metaKey: payload.metaKey }));
  route('listRedirectRules', payload => [{ id: 'redirect-1', language: payload.language }]);
  route('upsertRedirectRule', payload => ({ id: 'redirect-2', fromPath: payload.fromPath }));
  route('searchDocuments', payload => [{ id: 'search-1', query: payload.query }]);
  route('reindexContentEntries', payload => ({ count: 1, contentTypeKey: payload.contentTypeKey }));

  const decodedJWT = {
    permissions: {
      comments: { moderate: true },
      metadata: { manage: true },
      redirects: { manage: true },
      search: { manage: true }
    },
    userId: 'admin-1'
  };

  const call = (resource, action, params = {}) => new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource,
      action,
      params
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });

  const comments = await call('comments', 'listForEntry', { entryId: 'entry-1', status: 'pending' });
  assert.strictEqual(comments.eventName, 'listCommentsForEntry');
  assert.strictEqual(routed[0].payload.moduleName, 'commentsManager');
  assert.strictEqual(routed[0].payload.entryId, 'entry-1');

  const status = await call('comments', 'updateStatus', { commentId: 'comment-1', status: 'approved' });
  assert.strictEqual(status.eventName, 'updateCommentStatus');
  assert.strictEqual(status.data.status, 'approved');
  assert.strictEqual(routed[1].payload.status, 'approved');

  const metaValue = await call('metadata', 'getValue', {
    targetType: 'contentEntry',
    targetId: 'entry-1',
    metaKey: 'hero_color'
  });
  assert.strictEqual(metaValue.eventName, 'getMetadataValue');
  assert.strictEqual(metaValue.data, 'meta:hero_color');
  assert.strictEqual(routed[2].payload.moduleName, 'metadataManager');

  const setMeta = await call('metadata', 'set', {
    targetType: 'contentEntry',
    targetId: 'entry-1',
    metaKey: 'hero_color',
    value: '#fff'
  });
  assert.strictEqual(setMeta.eventName, 'setMetadata');
  assert.strictEqual(setMeta.data.targetId, 'entry-1');
  assert.strictEqual(routed[3].payload.value, '#fff');

  const redirects = await call('redirects', 'list', { language: 'de' });
  assert.strictEqual(redirects.eventName, 'listRedirectRules');
  assert.strictEqual(routed[4].payload.moduleName, 'redirectManager');
  assert.strictEqual(redirects.data[0].language, 'de');

  const upsertRedirect = await call('redirects', 'upsert', {
    fromPath: '/old',
    toPath: '/new',
    statusCode: 308
  });
  assert.strictEqual(upsertRedirect.eventName, 'upsertRedirectRule');
  assert.strictEqual(upsertRedirect.data.fromPath, '/old');

  const search = await call('search', 'query', { query: 'launch', status: 'draft' });
  assert.strictEqual(search.eventName, 'searchDocuments');
  assert.strictEqual(search.data[0].query, 'launch');
  assert.strictEqual(routed[6].payload.moduleName, 'searchManager');

  const reindex = await call('search', 'reindexContent', { contentTypeKey: 'post' });
  assert.strictEqual(reindex.eventName, 'reindexContentEntries');
  assert.strictEqual(reindex.data.contentTypeKey, 'post');
  assert.strictEqual(routed[7].payload.contentTypeKey, 'post');
});

test('runtime CMS admin facade dispatches backend infrastructure actions without exposing raw events', async () => {
  const emitter = new EventEmitter();
  setupRuntimeEvents(emitter);
  const routed = [];

  const route = (eventName, result) => {
    emitter.on(eventName, (payload, cb) => {
      routed.push({ eventName, payload });
      cb(null, typeof result === 'function' ? result(payload) : result);
    });
  };

  route('listLocalFolder', payload => [{ name: payload.folder || 'library' }]);
  route('makeFilePublic', payload => ({ publicUrl: `/media/${payload.filePath}` }));
  route('registerNavigationLocation', payload => ({ locationKey: payload.locationKey }));
  route('setLoginStrategyEnabled', payload => ({ strategyName: payload.strategyName, enabled: !!payload.enabled }));
  route('listFonts', [{ name: 'Inter' }]);
  route('addFont', payload => ({ success: true, name: payload.name }));
  route('listServerLocations', [{ id: 'srv-1' }]);
  route('addServerLocation', payload => ({ success: true, serverName: payload.serverName }));
  route('getShareDetails', payload => ({ shortToken: payload.shortToken }));
  route('createShareLink', payload => ({ shareURL: `/s/${payload.filePath}` }));
  route('setCmsMode', payload => ({ mode: payload.mode }));

  const decodedJWT = {
    permissions: {
      media: { manage: true },
      navigation: { manage: true },
      auth: { strategies: { manage: true } },
      fonts: { read: true, manage: true },
      serverManager: { createLocation: true, viewLocations: true },
      share: { create: true, read: true },
      settings: { core: { edit: true } }
    },
    userId: 'admin-1'
  };

  const call = (resource, action, params = {}) => new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource,
      action,
      params
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });

  const folder = await call('media', 'listLocalFolder', { folder: 'library' });
  assert.strictEqual(folder.eventName, 'listLocalFolder');
  assert.strictEqual(routed[0].payload.moduleName, 'mediaManager');

  const publicFile = await call('media', 'makeFilePublic', { filePath: 'hero.png' });
  assert.strictEqual(publicFile.eventName, 'makeFilePublic');
  assert.strictEqual(publicFile.data.publicUrl, '/media/hero.png');

  const location = await call('navigation', 'registerLocation', { locationKey: 'footer' });
  assert.strictEqual(location.eventName, 'registerNavigationLocation');
  assert.strictEqual(routed[2].payload.moduleName, 'navigationManager');

  const strategy = await call('auth', 'setStrategyEnabled', { strategyName: 'google', enabled: true });
  assert.strictEqual(strategy.eventName, 'setLoginStrategyEnabled');
  assert.strictEqual(strategy.data.enabled, true);

  const fonts = await call('fonts', 'list');
  assert.strictEqual(fonts.eventName, 'listFonts');
  assert.strictEqual(routed[4].payload.moduleName, 'fontsManager');

  const font = await call('fonts', 'add', { name: 'Brand', url: 'https://cdn.example/font.woff2' });
  assert.strictEqual(font.eventName, 'addFont');
  assert.strictEqual(font.data.name, 'Brand');

  const servers = await call('serverLocations', 'list');
  assert.strictEqual(servers.eventName, 'listServerLocations');
  assert.strictEqual(routed[6].payload.moduleName, 'serverManager');

  const server = await call('serverLocations', 'create', { serverName: 'edge-1', ipAddress: '127.0.0.1' });
  assert.strictEqual(server.eventName, 'addServerLocation');
  assert.strictEqual(server.data.serverName, 'edge-1');

  const share = await call('shares', 'get', { shortToken: 'abc123' });
  assert.strictEqual(share.eventName, 'getShareDetails');
  assert.strictEqual(routed[8].payload.moduleName, 'shareManager');

  const createdShare = await call('shares', 'create', { filePath: 'hero.png' });
  assert.strictEqual(createdShare.eventName, 'createShareLink');
  assert.strictEqual(createdShare.data.shareURL, '/s/hero.png');

  const mode = await call('settings', 'setCmsMode', { mode: 'maintenance' });
  assert.strictEqual(mode.eventName, 'setCmsMode');
  assert.strictEqual(mode.data.mode, 'maintenance');
});

test('runtime CMS admin facade dispatches identity, module, import and export actions', async () => {
  const emitter = new EventEmitter();
  setupRuntimeEvents(emitter);
  const routed = [];

  const route = (eventName, result) => {
    emitter.on(eventName, (payload, cb) => {
      routed.push({ eventName, payload });
      cb(null, typeof result === 'function' ? result(payload) : result);
    });
  };

  route('getAllUsers', [{ id: 'user-1', username: 'admin' }]);
  route('getAllRoles', [{ id: 'role-1', role_name: 'admin' }]);
  route('getAllPermissions', [{ permission_key: 'users.read' }]);
  route('getModuleRegistry', [{ module_name: 'example', is_active: true }]);
  route('listApps', [{ appName: 'designer', isActive: true }]);
  route('listImporters', ['wordpress', 'htmlTheme']);
  route('listExporters', [{ name: 'blogposterJson' }]);

  const decodedJWT = {
    permissions: {
      users: { read: true },
      userManagement: {
        listRoles: true,
        managePermissions: true
      },
      modules: { list: true },
      apps: { list: true },
      importers: { list: true },
      exporters: { list: true }
    },
    userId: 'admin-1'
  };

  const users = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'users',
      action: 'list'
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(users.eventName, 'getAllUsers');
  assert.strictEqual(users.data[0].username, 'admin');
  assert.strictEqual(routed[0].payload.moduleName, 'userManagement');

  const roles = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'roles',
      action: 'list'
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(roles.eventName, 'getAllRoles');
  assert.strictEqual(roles.data[0].role_name, 'admin');
  assert.strictEqual(routed[1].payload.moduleName, 'userManagement');

  const permissions = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'permissions',
      action: 'list'
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(permissions.eventName, 'getAllPermissions');
  assert.strictEqual(permissions.data[0].permission_key, 'users.read');
  assert.strictEqual(routed[2].payload.moduleName, 'userManagement');

  const modules = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'modules',
      action: 'registry'
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(modules.eventName, 'getModuleRegistry');
  assert.strictEqual(modules.data[0].module_name, 'example');
  assert.strictEqual(routed[3].payload.moduleName, 'moduleLoader');

  const apps = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'apps',
      action: 'list'
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(apps.eventName, 'listApps');
  assert.strictEqual(apps.data[0].appName, 'designer');
  assert.strictEqual(routed[4].payload.moduleName, 'appLoader');

  for (const action of ['installFromDirectory', 'uninstall']) {
    const blockedAppWrite = await new Promise(resolve => {
      emitter.emit('cmsAdminApiRequest', {
        jwt: 'admin-token',
        moduleName: 'runtimeManager',
        moduleType: 'core',
        decodedJWT,
        resource: 'apps',
        action,
        params: { appName: 'designer', sourceDir: 'C:/tmp/designer' }
      }, (err, result) => resolve({ err, result }));
    });
    assert(blockedAppWrite.err);
    assert.match(blockedAppWrite.err.message, new RegExp(`Unknown CMS admin API action: apps\\.${action}`));
  }

  const importers = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'importers',
      action: 'list'
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(importers.eventName, 'listImporters');
  assert.deepStrictEqual(importers.data, ['wordpress', 'htmlTheme']);
  assert.strictEqual(routed[5].payload.moduleName, 'importer');

  const exporters = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'exporters',
      action: 'list'
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(exporters.eventName, 'listExporters');
  assert.strictEqual(exporters.data[0].name, 'blogposterJson');
  assert.strictEqual(routed[6].payload.moduleName, 'exportManager');
});

test('runtime CMS admin facade dispatches legacy page actions', async () => {
  const emitter = new EventEmitter();
  setupRuntimeEvents(emitter);
  const routed = [];

  const route = (eventName, result) => {
    emitter.on(eventName, (payload, cb) => {
      routed.push({ eventName, payload });
      cb(null, typeof result === 'function' ? result(payload) : result);
    });
  };

  route('getAllPages', [{ id: 'page-1', slug: 'home' }]);
  route('getPagesByLane', payload => [{ id: 'page-1', lane: payload.lane }]);
  route('getEnvelope', payload => ({ slug: payload.slug, lane: 'public', attachments: [] }));
  route('searchPages', payload => [{ id: 'page-1', query: payload.query }]);
  route('createPage', payload => ({ pageId: 'page-2', title: payload.title }));
  route('updatePage', { updated: true });
  route('setAsDeleted', { trashed: true });
  route('deletePage', { deleted: true });
  route('setAsStart', { start: true });

  const decodedJWT = {
    permissions: {
      pages: {
        create: true,
        read: true,
        update: true,
        delete: true,
        manage: true
      }
    },
    userId: 'admin-1'
  };

  const call = (action, params = {}) => new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'pages',
      action,
      params
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });

  const list = await call('list');
  assert.strictEqual(list.eventName, 'getAllPages');
  assert.strictEqual(routed[0].payload.moduleName, 'pagesManager');

  const byLane = await call('byLane', { lane: 'public' });
  assert.strictEqual(byLane.eventName, 'getPagesByLane');
  assert.strictEqual(byLane.data[0].lane, 'public');

  const envelope = await call('envelope', { slug: 'home' });
  assert.strictEqual(envelope.eventName, 'getEnvelope');
  assert.strictEqual(envelope.data.slug, 'home');

  const search = await call('search', { query: 'home' });
  assert.strictEqual(search.eventName, 'searchPages');
  assert.strictEqual(routed[3].payload.query, 'home');

  const create = await call('create', { title: 'About', lane: 'public' });
  assert.strictEqual(create.eventName, 'createPage');
  assert.strictEqual(create.data.title, 'About');

  const update = await call('update', { pageId: 'page-2', title: 'About us' });
  assert.strictEqual(update.eventName, 'updatePage');
  assert.strictEqual(update.data.updated, true);

  const trash = await call('trash', { pageId: 'page-2' });
  assert.strictEqual(trash.eventName, 'setAsDeleted');
  assert.strictEqual(trash.data.trashed, true);

  const del = await call('delete', { pageId: 'page-2' });
  assert.strictEqual(del.eventName, 'deletePage');
  assert.strictEqual(del.data.deleted, true);

  const start = await call('setStart', { pageId: 'page-1' });
  assert.strictEqual(start.eventName, 'setAsStart');
  assert.strictEqual(start.data.start, true);
});

test('runtime CMS admin facade dispatches widget management actions', async () => {
  const emitter = new EventEmitter();
  setupRuntimeEvents(emitter);
  const routed = [];

  const route = (eventName, result) => {
    emitter.on(eventName, (payload, cb) => {
      routed.push({ eventName, payload });
      cb(null, typeof result === 'function' ? result(payload) : result);
    });
  };

  route('getWidgets', [{ widgetId: 'hero', widgetType: 'public' }]);
  route('createWidget', payload => ({ created: true, widgetId: payload.widgetId }));
  route('updateWidget', { updated: true });
  route('saveLayout.v1', { success: true, updated: 1 });
  route('deleteWidget', { deleted: true });

  const decodedJWT = {
    permissions: {
      widgets: {
        create: true,
        read: true,
        update: true,
        delete: true,
        saveLayout: true
      }
    },
    userId: 'admin-1'
  };

  const list = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'widgets',
      action: 'list',
      params: { widgetType: 'public' }
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(list.eventName, 'getWidgets');
  assert.strictEqual(routed[0].payload.moduleName, 'widgetManager');
  assert.strictEqual(routed[0].payload.widgetType, 'public');

  const create = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'widgets',
      action: 'create',
      params: {
        widgetId: 'hero',
        widgetType: 'public',
        content: '<div>Hero</div>'
      }
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(create.eventName, 'createWidget');
  assert.strictEqual(create.data.widgetId, 'hero');
  assert.strictEqual(routed[1].payload.content, '<div>Hero</div>');

  const update = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'widgets',
      action: 'update',
      params: {
        widgetId: 'hero',
        widgetType: 'public',
        newLabel: 'Hero'
      }
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(update.eventName, 'updateWidget');
  assert.strictEqual(routed[2].payload.newLabel, 'Hero');

  const saveLayout = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'widgets',
      action: 'saveLayout',
      params: {
        lane: 'public',
        layout: [{ widgetId: 'hero', order: 1 }]
      }
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(saveLayout.eventName, 'saveLayout.v1');
  assert.strictEqual(routed[3].payload.lane, 'public');
  assert.strictEqual(routed[3].payload.layout[0].widgetId, 'hero');

  const del = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'widgets',
      action: 'delete',
      params: {
        widgetId: 'hero',
        widgetType: 'public'
      }
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(del.eventName, 'deleteWidget');
  assert.strictEqual(routed[4].payload.widgetId, 'hero');
});

test('runtime CMS admin facade dispatches PlainSpace presentation actions', async () => {
  const emitter = new EventEmitter();
  setupRuntimeEvents(emitter);
  const routed = [];

  const route = (eventName, result) => {
    emitter.on(eventName, (payload, cb) => {
      routed.push({ eventName, payload });
      cb(null, typeof result === 'function' ? result(payload) : result);
    });
  };

  route('widget.registry.request.v1', payload => ({ widgets: [{ id: 'hero', lane: payload.lane }] }));
  route('getLayoutForViewport', payload => ({ layout: [{ widgetId: 'hero' }], viewport: payload.viewport }));
  route('getAllLayoutsForPage', payload => ({ layouts: [{ pageId: payload.pageId, viewport: 'desktop' }] }));
  route('saveLayoutForViewport', { saved: true });
  route('getLayoutTemplate', payload => ({ name: payload.name, layout: [] }));
  route('getLayoutTemplateNames', { templates: [{ name: 'landing' }] });
  route('saveLayoutTemplate', payload => ({ name: payload.name, saved: true }));
  route('deleteLayoutTemplate', payload => ({ name: payload.name, deleted: true }));
  route('getGlobalLayoutTemplate', { name: 'landing', layout: [] });
  route('setGlobalLayoutTemplate', payload => ({ name: payload.name, global: true }));
  route('getWidgetInstance', payload => ({ instanceId: payload.instanceId, content: '{}' }));
  route('saveWidgetInstance', payload => ({ instanceId: payload.instanceId, saved: true }));
  route('getPublishedDesignMeta', payload => ({ name: payload.name, path: '/designs/home', files: [] }));
  route('savePublishedDesignMeta', payload => ({ name: payload.name, saved: true }));

  const decodedJWT = {
    permissions: {
      plainspace: {
        read: true,
        saveLayout: true,
        saveLayoutTemplate: true,
        widgetInstance: true
      },
      widgets: { read: true }
    },
    userId: 'admin-1'
  };

  const call = (action, params = {}) => new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'plainSpace',
      action,
      params
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });

  const registry = await call('widgetRegistry', { lane: 'admin' });
  assert.strictEqual(registry.eventName, 'widget.registry.request.v1');
  assert.strictEqual(registry.data.widgets[0].lane, 'admin');
  assert.strictEqual(routed[0].payload.moduleName, 'plainspace');

  const layout = await call('layoutForViewport', { pageId: 'page-1', lane: 'public', viewport: 'desktop' });
  assert.strictEqual(layout.eventName, 'getLayoutForViewport');
  assert.strictEqual(layout.data.viewport, 'desktop');

  const allLayouts = await call('allLayoutsForPage', { pageId: 'page-1', lane: 'public' });
  assert.strictEqual(allLayouts.eventName, 'getAllLayoutsForPage');
  assert.strictEqual(allLayouts.data.layouts[0].pageId, 'page-1');

  const saveLayout = await call('saveLayoutForViewport', {
    pageId: 'page-1',
    lane: 'public',
    viewport: 'desktop',
    layout: [{ widgetId: 'hero' }]
  });
  assert.strictEqual(saveLayout.eventName, 'saveLayoutForViewport');
  assert.strictEqual(routed[3].payload.layout[0].widgetId, 'hero');

  const template = await call('layoutTemplate', { name: 'landing' });
  assert.strictEqual(template.eventName, 'getLayoutTemplate');
  assert.strictEqual(template.data.name, 'landing');

  const templateNames = await call('layoutTemplateNames', { lane: 'public' });
  assert.strictEqual(templateNames.eventName, 'getLayoutTemplateNames');
  assert.strictEqual(templateNames.data.templates[0].name, 'landing');

  const saveTemplate = await call('saveLayoutTemplate', {
    name: 'landing',
    lane: 'public',
    viewport: 'desktop',
    layout: [],
    previewPath: ''
  });
  assert.strictEqual(saveTemplate.eventName, 'saveLayoutTemplate');

  const deleteTemplate = await call('deleteLayoutTemplate', { name: 'landing' });
  assert.strictEqual(deleteTemplate.eventName, 'deleteLayoutTemplate');
  assert.strictEqual(deleteTemplate.data.deleted, true);

  const globalTemplate = await call('globalLayoutTemplate');
  assert.strictEqual(globalTemplate.eventName, 'getGlobalLayoutTemplate');

  const setGlobal = await call('setGlobalLayoutTemplate', { name: 'landing' });
  assert.strictEqual(setGlobal.eventName, 'setGlobalLayoutTemplate');
  assert.strictEqual(setGlobal.data.global, true);

  const widgetInstance = await call('widgetInstance', { instanceId: 'default.hero' });
  assert.strictEqual(widgetInstance.eventName, 'getWidgetInstance');
  assert.strictEqual(widgetInstance.data.instanceId, 'default.hero');

  const saveWidgetInstance = await call('saveWidgetInstance', {
    instanceId: 'default.hero',
    content: '{}'
  });
  assert.strictEqual(saveWidgetInstance.eventName, 'saveWidgetInstance');

  const publishedMeta = await call('publishedDesignMeta', { name: 'home' });
  assert.strictEqual(publishedMeta.eventName, 'getPublishedDesignMeta');
  assert.strictEqual(publishedMeta.data.path, '/designs/home');

  const saveMeta = await call('savePublishedDesignMeta', {
    name: 'home',
    path: '/designs/home',
    files: []
  });
  assert.strictEqual(saveMeta.eventName, 'savePublishedDesignMeta');
});

test('runtime CMS admin facade dispatches Designer actions', async () => {
  const emitter = new EventEmitter();
  setupRuntimeEvents(emitter);
  const routed = [];

  const route = (eventName, result) => {
    emitter.on(eventName, (payload, cb) => {
      routed.push({ eventName, payload });
      cb(null, typeof result === 'function' ? result(payload) : result);
    });
  };

  route('designer.getDesign', payload => ({ design: { id: payload.id, title: 'Hero' }, widgets: [] }));
  route('designer.getLayout', payload => ({ layout: { id: payload.id, name: 'Landing' } }));
  route('designer.listDesigns', { designs: [{ id: 'design-1' }] });
  route('designer.listLayouts', { layouts: [{ id: 'layout-1' }] });
  route('designer.saveDesign', payload => ({ id: payload.id || 'design-1', version: 2 }));

  const decodedJWT = {
    permissions: {
      builder: {
        use: true,
        publish: true
      }
    },
    userId: 'designer-admin'
  };

  const call = (action, params = {}) => new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'designer',
      action,
      params
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });

  const design = await call('get', { id: 'design-1' });
  assert.strictEqual(design.eventName, 'designer.getDesign');
  assert.strictEqual(design.data.design.id, 'design-1');
  assert.strictEqual(routed[0].payload.moduleName, 'designer');
  assert.strictEqual(routed[0].payload.moduleType, 'core');
  assert.strictEqual(routed[0].payload.jwt, 'admin-token');

  const layout = await call('getLayout', { id: 'layout-1' });
  assert.strictEqual(layout.eventName, 'designer.getLayout');
  assert.strictEqual(layout.data.layout.name, 'Landing');

  const list = await call('list');
  assert.strictEqual(list.eventName, 'designer.listDesigns');
  assert.strictEqual(list.data.designs[0].id, 'design-1');

  const layouts = await call('layouts');
  assert.strictEqual(layouts.eventName, 'designer.listLayouts');
  assert.strictEqual(layouts.data.layouts[0].id, 'layout-1');

  const saved = await call('save', { id: 'design-1', title: 'Hero' });
  assert.strictEqual(saved.eventName, 'designer.saveDesign');
  assert.strictEqual(saved.data.version, 2);
});

test('runtime CMS admin facade limits app-origin requests to query actions', async () => {
  const emitter = new EventEmitter();
  setupRuntimeEvents(emitter);
  const routed = [];

  emitter.on('listContentEntries', (payload, cb) => {
    routed.push({ eventName: 'listContentEntries', payload });
    cb(null, [{ id: 'entry-1' }]);
  });
  emitter.on('createContentEntry', (payload, cb) => {
    routed.push({ eventName: 'createContentEntry', payload });
    cb(null, { id: 'entry-created', title: payload.title });
  });
  emitter.on('getPublicSettings', (payload, cb) => {
    routed.push({ eventName: 'getPublicSettings', payload });
    cb(null, { SITE_TITLE: 'Blogposter' });
  });
  emitter.on('getPageById', (payload, cb) => {
    routed.push({ eventName: 'getPageById', payload });
    cb(null, { id: payload.pageId, slug: 'home' });
  });
  emitter.on('getLayoutForViewport', (payload, cb) => {
    routed.push({ eventName: 'getLayoutForViewport', payload });
    cb(null, { layout: [{ widgetId: 'hero' }], viewport: payload.viewport });
  });
  emitter.on('saveLayoutForViewport', (payload, cb) => {
    routed.push({ eventName: 'saveLayoutForViewport', payload });
    cb(null, { saved: true });
  });
  emitter.on('listApps', (payload, cb) => {
    routed.push({ eventName: 'listApps', payload });
    cb(null, [{ appName: 'designer' }]);
  });
  emitter.on('getAllUsers', (payload, cb) => {
    routed.push({ eventName: 'getAllUsers', payload });
    cb(null, [{ id: 1, username: 'admin' }]);
  });
  emitter.on('uninstallApp', (payload, cb) => {
    routed.push({ eventName: 'uninstallApp', payload });
    cb(null, { appName: payload.appName });
  });

  const decodedJWT = {
    permissions: {
      '*': true
    },
    userId: 'admin-1'
  };
  const appContext = { appName: 'designer', event: 'cms-admin-request' };

  const allowed = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'content',
      action: 'list',
      params: { contentTypeKey: 'post' },
      appContext
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(allowed.eventName, 'listContentEntries');
  assert.strictEqual(allowed.data[0].id, 'entry-1');
  assert.strictEqual(routed[0].payload.moduleName, 'contentEngine');

  const deniedCreate = await new Promise(resolve => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'content',
      action: 'create',
      params: { title: 'Created from app' },
      appContext
    }, (err, result) => resolve({ err, result }));
  });
  assert(deniedCreate.err);
  assert.match(deniedCreate.err.message, /apps can only query/);

  const allowedPublicSettings = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'settings',
      action: 'public',
      params: { keys: ['SITE_TITLE'] },
      appContext
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(allowedPublicSettings.eventName, 'getPublicSettings');
  assert.strictEqual(allowedPublicSettings.data.SITE_TITLE, 'Blogposter');

  const allowedPage = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'pages',
      action: 'get',
      params: { pageId: 'page-1' },
      appContext
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(allowedPage.eventName, 'getPageById');
  assert.strictEqual(allowedPage.data.slug, 'home');
  assert.strictEqual(routed[2].payload.moduleName, 'pagesManager');

  const allowedLayout = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'plainSpace',
      action: 'layoutForViewport',
      params: { pageId: 'page-1', lane: 'public', viewport: 'desktop' },
      appContext
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(allowedLayout.eventName, 'getLayoutForViewport');
  assert.strictEqual(allowedLayout.data.viewport, 'desktop');
  assert.strictEqual(routed[3].payload.moduleName, 'plainspace');

  const deniedLayoutWrite = await new Promise(resolve => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'plainSpace',
      action: 'saveLayoutForViewport',
      params: { pageId: 'page-1', lane: 'public', viewport: 'desktop', layout: [] },
      appContext
    }, (err, result) => resolve({ err, result }));
  });
  assert(deniedLayoutWrite.err);
  assert.match(deniedLayoutWrite.err.message, /apps can only query/);

  const deniedAppsList = await new Promise(resolve => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'apps',
      action: 'list',
      appContext
    }, (err, result) => resolve({ err, result }));
  });
  assert(deniedAppsList.err);
  assert.match(deniedAppsList.err.message, /apps can only query/);

  const deniedUsersList = await new Promise(resolve => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'users',
      action: 'list',
      appContext
    }, (err, result) => resolve({ err, result }));
  });
  assert(deniedUsersList.err);
  assert.match(deniedUsersList.err.message, /apps can only query/);

  const deniedUninstall = await new Promise(resolve => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'apps',
      action: 'uninstall',
      params: { appName: 'designer' },
      appContext
    }, (err, result) => resolve({ err, result }));
  });
  assert(deniedUninstall.err);
  assert.match(deniedUninstall.err.message, /Unknown CMS admin API action: apps\.uninstall/);
  assert.deepStrictEqual(routed.map(entry => entry.eventName), ['listContentEntries', 'getPublicSettings', 'getPageById', 'getLayoutForViewport']);
});

test('runtime CMS admin facade allows writes only for core-owned legacy app bridges', async () => {
  const emitter = new EventEmitter();
  setupRuntimeEvents(emitter);
  const routed = [];

  emitter.on('designer.saveDesign', (payload, cb) => {
    routed.push({ eventName: 'designer.saveDesign', payload });
    cb(null, { id: payload.id || 'design-1', version: 3 });
  });
  emitter.on('createContentEntry', (payload, cb) => {
    routed.push({ eventName: 'createContentEntry', payload });
    cb(null, { id: 'entry-created', title: payload.title });
  });

  const decodedJWT = {
    permissions: { '*': true },
    userId: 'admin-1'
  };

  const allowedDesignerSave = await new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'designer',
      action: 'save',
      params: { id: 'design-1', title: 'Hero' },
      appContext: {
        appName: 'designer',
        event: 'cms-meltdown-request',
        targetEvent: 'designer.saveDesign',
        coreOwned: true
      }
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  assert.strictEqual(allowedDesignerSave.eventName, 'designer.saveDesign');
  assert.strictEqual(allowedDesignerSave.data.version, 3);

  const deniedUserManagedLegacyWrite = await new Promise(resolve => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'content',
      action: 'create',
      params: { title: 'Created from app' },
      appContext: {
        appName: 'thinapp',
        event: 'cms-meltdown-request',
        targetEvent: 'createContentEntry',
        coreOwned: false
      }
    }, (err, result) => resolve({ err, result }));
  });
  assert(deniedUserManagedLegacyWrite.err);
  assert.match(deniedUserManagedLegacyWrite.err.message, /apps can only query/);

  const deniedCoreOwnedCmsAdminWrite = await new Promise(resolve => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource: 'content',
      action: 'create',
      params: { title: 'Created from app' },
      appContext: {
        appName: 'designer',
        event: 'cms-admin-request',
        coreOwned: true
      }
    }, (err, result) => resolve({ err, result }));
  });
  assert(deniedCoreOwnedCmsAdminWrite.err);
  assert.match(deniedCoreOwnedCmsAdminWrite.err.message, /apps can only query/);

  assert.deepStrictEqual(routed.map(entry => entry.eventName), ['designer.saveDesign']);
});

test('runtime CMS admin facade dispatches shell inventory reads through stable contracts', async () => {
  const emitter = new EventEmitter();
  setupRuntimeEvents(emitter);
  const routed = [];

  emitter.on('listLoginStrategies', (payload, cb) => {
    routed.push({ eventName: 'listLoginStrategies', payload });
    cb(null, [{ name: 'adminLocal' }]);
  });
  emitter.on('getRecentNotifications', (payload, cb) => {
    routed.push({ eventName: 'getRecentNotifications', payload });
    cb(null, [{ moduleName: 'runtimeManager', message: 'ready' }]);
  });
  emitter.on('listBuilderApps', (payload, cb) => {
    routed.push({ eventName: 'listBuilderApps', payload });
    cb(null, { apps: [{ name: 'designer' }] });
  });
  emitter.on('getAppLaunchInfo', (payload, cb) => {
    routed.push({ eventName: 'getAppLaunchInfo', payload });
    cb(null, { appName: payload.appName, isActive: true });
  });
  emitter.on('getCmsMode', (payload, cb) => {
    routed.push({ eventName: 'getCmsMode', payload });
    cb(null, 'standard');
  });

  const decodedJWT = {
    permissions: {
      auth: { strategies: { view: true } },
      notifications: { read: true },
      builder: { use: true },
      settings: { core: { view: true } }
    },
    userId: 'admin-1'
  };
  const call = (resource, action, params = {}) => new Promise((resolve, reject) => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT,
      resource,
      action,
      params
    }, (err, result) => (err ? reject(err) : resolve(result)));
  });

  const strategies = await call('auth', 'loginStrategies');
  assert.strictEqual(strategies.eventName, 'listLoginStrategies');
  assert.strictEqual(strategies.data[0].name, 'adminLocal');

  const notifications = await call('notifications', 'recent', { limit: 5 });
  assert.strictEqual(notifications.eventName, 'getRecentNotifications');
  assert.strictEqual(routed[1].payload.limit, 5);

  const builderApps = await call('apps', 'builderList');
  assert.strictEqual(builderApps.eventName, 'listBuilderApps');
  assert.strictEqual(builderApps.data.apps[0].name, 'designer');

  const launch = await call('apps', 'launchInfo', { appName: 'designer' });
  assert.strictEqual(launch.eventName, 'getAppLaunchInfo');
  assert.strictEqual(launch.data.appName, 'designer');

  const cmsMode = await call('settings', 'cmsMode');
  assert.strictEqual(cmsMode.eventName, 'getCmsMode');
  assert.strictEqual(cmsMode.data, 'standard');

  assert.deepStrictEqual(routed.map(entry => entry.payload.moduleName), [
    'auth',
    'notificationManager',
    'appLoader',
    'appLoader',
    'settingsManager'
  ]);
});

test('runtime CMS admin facade rejects missing principals, permissions and unknown actions', async () => {
  const emitter = new EventEmitter();
  setupRuntimeEvents(emitter);
  let routed = false;
  emitter.on('listContentEntries', (_payload, cb) => {
    routed = true;
    cb(null, []);
  });

  const missingPrincipal = await new Promise(resolve => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'content',
      action: 'list'
    }, (err, result) => resolve({ err, result }));
  });
  assert(missingPrincipal.err);
  assert.match(missingPrincipal.err.message, /admin principal/);

  const publicPrincipal = await new Promise(resolve => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'public-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT: { isPublic: true, permissions: { '*': true } },
      resource: 'content',
      action: 'list'
    }, (err, result) => resolve({ err, result }));
  });
  assert(publicPrincipal.err);
  assert.match(publicPrincipal.err.message, /admin principal/);

  const denied = await new Promise(resolve => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT: { permissions: { content: { create: true } } },
      resource: 'content',
      action: 'list'
    }, (err, result) => resolve({ err, result }));
  });
  assert(denied.err);
  assert.match(denied.err.message, /content\.update/);

  const unknown = await new Promise(resolve => {
    emitter.emit('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT: { permissions: { '*': true } },
      resource: 'content',
      action: 'rawSql'
    }, (err, result) => resolve({ err, result }));
  });
  assert(unknown.err);
  assert.match(unknown.err.message, /Unknown CMS admin API action/);
  assert.strictEqual(routed, false);
});

test('runtime public navigation API requests active trees and filters hidden items', async () => {
  const app = express();
  const emitter = new EventEmitter();
  let payloadSeen = null;

  emitter.on('getNavigationTree', (payload, cb) => {
    payloadSeen = payload;
    cb(null, {
      menu: { id: 'menu-main', key: 'main', label: 'Main', location_key: 'primary' },
      items: [
        { id: 'item-home', title: 'Home', url: '/', status: 'active', position: 0 },
        { id: 'item-hidden', title: 'Hidden', url: '/hidden', status: 'hidden', position: 1 }
      ],
      tree: [
        {
          id: 'item-home',
          title: 'Home',
          url: '/',
          status: 'active',
          children: [
            { id: 'item-child-hidden', title: 'Draft', url: '/draft', status: 'hidden' }
          ]
        }
      ]
    });
  });

  registerPublicRuntimeRoutes(app, emitter, 'runtime-token');

  const server = await startApp(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const result = await axios.get(`${base}/api/public/navigation/primary`);
    assert.strictEqual(result.status, 200);
    assert.strictEqual(payloadSeen.moduleName, 'navigationManager');
    assert.strictEqual(payloadSeen.status, 'active');
    assert.strictEqual(result.data.items.length, 1);
    assert.strictEqual(result.data.items[0].id, 'item-home');
    assert.strictEqual(result.data.tree[0].children.length, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('runtime public settings API returns only allowlisted settings', async () => {
  const app = express();
  const emitter = new EventEmitter();
  let payloadSeen = null;

  emitter.on('getPublicSettings', (payload, cb) => {
    payloadSeen = payload;
    if ((payload.keys || []).includes('JWT_SECRET')) {
      return cb(new Error('Forbidden - key not allowed'));
    }
    cb(null, { SITE_TITLE: 'Blogposter' });
  });

  registerPublicRuntimeRoutes(app, emitter, 'runtime-token');

  const server = await startApp(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const result = await axios.get(`${base}/api/public/settings`, {
      params: { keys: 'SITE_TITLE' }
    });
    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(result.data.settings, { SITE_TITLE: 'Blogposter' });
    assert.strictEqual(payloadSeen.moduleName, 'settingsManager');
    assert.strictEqual(payloadSeen.jwt, 'runtime-token');
    assert.deepStrictEqual(payloadSeen.keys, ['SITE_TITLE']);

    const denied = await axios.get(`${base}/api/public/settings`, {
      params: { keys: 'JWT_SECRET' },
      validateStatus: () => true
    });
    assert.strictEqual(denied.status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('runtime public SEO API refuses draft-backed paths', async () => {
  const app = express();
  const emitter = new EventEmitter();
  let seoCalls = 0;

  emitter.on('resolveContentPermalink', (payload, cb) => {
    if (payload.permalink === '/draft') {
      cb(null, { id: 'entry-draft', status: 'draft', title: 'Draft' });
      return;
    }
    cb(null, null);
  });
  emitter.on('resolveSeoMeta', (payload, cb) => {
    seoCalls += 1;
    cb(null, {
      target: { targetType: payload.path ? 'path' : 'global', targetKey: payload.path || 'default' },
      seo: { title: 'Public SEO' },
      entry: { id: 'ignored', status: 'draft', title: 'Ignored Draft' }
    });
  });

  registerPublicRuntimeRoutes(app, emitter, 'runtime-token');

  const server = await startApp(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const draft = await axios.get(`${base}/api/public/seo`, {
      params: { path: '/draft' },
      validateStatus: () => true
    });
    assert.strictEqual(draft.status, 404);
    assert.strictEqual(seoCalls, 0);

    const missing = await axios.get(`${base}/api/public/seo`, {
      params: { path: '/no-entry' }
    });
    assert.strictEqual(missing.status, 200);
    assert.strictEqual(missing.data.seo.title, 'Public SEO');
    assert.strictEqual(missing.data.entry, null);
    assert.strictEqual(seoCalls, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('runtime redirect middleware defers to maintenance mode', async () => {
  const app = express();
  const emitter = new EventEmitter();
  let redirectLookups = 0;

  emitter.on('generateSeoSitemap', (_payload, cb) => cb(null, '<urlset></urlset>'));
  emitter.on('generateRobotsTxt', (_payload, cb) => cb(null, 'User-agent: *\nAllow: /\n'));
  emitter.on('getSetting', (_payload, cb) => cb(null, 'true'));
  emitter.on('resolveRedirect', (_payload, cb) => {
    redirectLookups += 1;
    cb(null, { target: '/new', statusCode: 301 });
  });

  registerPublicRuntimeRoutes(app, emitter, 'runtime-token');
  app.get('/old', (_req, res) => res.send('maintenance will handle next in real app'));

  const server = await startApp(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const result = await axios.get(`${base}/old`, {
      maxRedirects: 0,
      validateStatus: () => true
    });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(redirectLookups, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('runtime manager publishes scheduled content through Content Engine', async () => {
  const emitter = new EventEmitter();
  let payloadSeen = null;
  emitter.on('publishScheduledContentEntries', (payload, cb) => {
    payloadSeen = payload;
    cb(null, { dueCount: 1, publishedCount: 1 });
  });

  const result = await runScheduledPublisherOnce(emitter, 'runtime-token', { limit: 7 });

  assert.deepStrictEqual(result, { dueCount: 1, publishedCount: 1 });
  assert.strictEqual(payloadSeen.moduleName, 'contentEngine');
  assert.strictEqual(payloadSeen.jwt, 'runtime-token');
  assert.strictEqual(payloadSeen.limit, 7);
  assert.match(payloadSeen.dueBefore, /^\d{4}-\d{2}-\d{2}T/);
});

test('runtime redirect matcher only checks public GET and HEAD requests', () => {
  assert.strictEqual(shouldCheckRedirect({ method: 'GET', path: '/old' }), true);
  assert.strictEqual(shouldCheckRedirect({ method: 'HEAD', path: '/old' }), true);
  assert.strictEqual(shouldCheckRedirect({ method: 'POST', path: '/old' }), false);
  assert.strictEqual(shouldCheckRedirect({ method: 'GET', path: '/admin/home' }), false);
  assert.strictEqual(shouldCheckRedirect({ method: 'GET', path: '/api/meltdown' }), false);
  assert.strictEqual(shouldCheckRedirect({ method: 'GET', path: '/widgets/weather/widget.js' }), false);
});
