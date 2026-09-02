const express = require('express');
const axios = require('axios');
const path = require('path');

const { mountStaticAssetRoutes } = require('../mother/server/http/staticAssets');

test('serves only Media Manager public files through the canonical media path', async () => {
  const app = express();
  const fixtureRoot = path.join(__dirname, 'fixtures', 'static-root');

  mountStaticAssetRoutes(app, {
    rootDir: fixtureRoot,
    securityConfig: { postMessage: { originToken: {} } }
  });

  const server = app.listen(0);
  const address = server.address();

  try {
    const response = await axios.get(
      `http://127.0.0.1:${address.port}/media/media-check.css`
    );

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/css/);
    expect(response.data).toContain('--media-route-check: ready');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
