const http = require('http');
const path = require('path');
const express = require('express');

const { createPublicPageRoutes } = require('../mother/server/http/publicPageRoutes');
const { sanitizeSlug } = require('../mother/server/utils/text');

function request(server, requestPath) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request({
      host: '127.0.0.1',
      port: address.port,
      path: requestPath,
      method: 'GET'
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
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
      if (eventName === 'getPageBySlug') {
        seenSlugs.push(payload.slug);
        callback(null, payload.slug === expectedSlug
          ? { id: 'page-1', slug: expectedSlug }
          : null);
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
  it('renders a published page whose slug contains multiple path segments', async () => {
    const seenSlugs = [];
    const expectedSlug = 'guides/getting-started/install';
    const server = createServer(expectedSlug, seenSlugs);

    try {
      const response = await request(server, `/${expectedSlug}`);

      expect(response.status).toBe(200);
      expect(seenSlugs).toContain(expectedSlug);
      expect(response.body).toContain(`window.PAGE_SLUG = ${JSON.stringify(expectedSlug)}`);
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
