const http = require('http');
const path = require('path');
const express = require('express');

const { createPublicPageRoutes } = require('../mother/server/http/publicPageRoutes');
const { sanitizeSlug } = require('../mother/server/utils/text');

function request(server, requestPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request({
      host: '127.0.0.1',
      port: address.port,
      path: requestPath,
      method: 'GET', headers
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

function createEmitter(expectedSlug, seenSlugs) {
  return {
    emit(eventName, payload, callback) {
      if (eventName === 'ensurePublicToken') {
        callback(null, 'public-token');
        return;
      }
      if (eventName === 'cmsPublicRuntimeRequest') {
        seenSlugs.push(payload.params.slug);
        const data = payload.action === 'envelope' ? {
          meta: { seoTitle: 'Published <title>', seoDesc: 'Published description', seoImage: '/cover.png' },
          attachments: [{ type: 'html', descriptor: { inline: { html: '<h1>Initial content</h1>' } } }]
        }
          : payload.params.slug === expectedSlug ? { id: 'page-1', slug: expectedSlug } : null;
        callback(null, { resource: payload.resource, action: payload.action, eventName: 'test', data });
        return;
      }
      callback(null, null);
    }
  };
}

function createServer(expectedSlug, seenSlugs) {
  const app = express();
  app.use(createPublicPageRoutes({
    motherEmitter: createEmitter(expectedSlug, seenSlugs),
    plainSpaceVersion: 'test',
    renderMode: 'client',
    rootDir: path.join(__dirname, '..'),
    sanitizeSlug,
    securityConfig: {}
  }));
  return app.listen(0);
}

describe('nested public page routes', () => {
  it('records one delivery and excludes DNT/GPC and missing pages', async () => {
    const collector = require('../mother/modules/analyticsManager/collector');
    collector.take(); collector.setEnabled(true);
    const server = createServer('guides/known', []);
    try {
      await request(server, '/guides/known', { 'user-agent': 'Windows Chrome/120', referer: 'https://example.com/private?q=secret' });
      const rows = collector.take();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ kind: 'page', page: 'page-1', browser: 'Chrome', source: 'example.com' });
      await request(server, '/guides/known', { DNT: '1' });
      await request(server, '/guides/known', { 'Sec-GPC': '1' });
      await request(server, '/missing');
      expect(collector.take()).toHaveLength(0);
    } finally { collector.setEnabled(false); await new Promise(resolve => server.close(resolve)); }
  });
  it('renders a published page whose slug contains multiple path segments', async () => {
    const seenSlugs = [];
    const expectedSlug = 'guides/getting-started/install';
    const server = createServer(expectedSlug, seenSlugs);

    try {
      const response = await request(server, `/${expectedSlug}`);

      expect(response.status).toBe(200);
      expect(seenSlugs).toContain(expectedSlug);
      expect(response.body).toContain(`window.PAGE_SLUG = ${JSON.stringify(expectedSlug)}`);
      expect(response.body).toContain('<h1>Initial content</h1>');
      expect(response.body).toContain('<title>Published &lt;title&gt;</title>');
      expect(response.body).toContain('<meta name="description" content="Published description">');
      expect(response.body).toMatch(/<meta property="og:image" content="https?:\/\/[^"\s]+\/cover.png">/);
      expect(response.body).toContain('window.BP_PUBLIC_BOOTSTRAP');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['content-security-policy']).toContain("script-src 'self' blob: 'nonce-");
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('falls through for an unknown nested path instead of serving another page', async () => {
    const seenSlugs = [];
    const server = createServer('guides/known', seenSlugs);

    try {
      const response = await request(server, '/guides/unknown');

      expect(response.status).toBe(404);
      expect(seenSlugs).toContain('guides/unknown');
      expect(response.body).not.toContain('window.PAGE_ID');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
