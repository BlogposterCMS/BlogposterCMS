const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { mountStaticAssetRoutes } = require('../mother/server/http/staticAssets');
const { versionShellAssets } = require('../mother/server/http/assetVersions');

test('shell asset versions change with bytes and only verified versions receive long caching', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-asset-version-'));
  const publicPath = path.join(rootDir, 'public');
  fs.mkdirSync(path.join(publicPath, 'assets'), { recursive: true });
  const filePath = path.join(publicPath, 'assets', 'site.css');
  fs.writeFileSync(filePath, 'body {color: red}');
  const shell = '<link href="/assets/site.css"><script src="/build/missing.js"></script><a href="/admin">Home</a>';
  const first = versionShellAssets(shell, publicPath);
  const firstUrl = first.match(/href="([^"]+)"/)[1];
  expect(firstUrl).toMatch(/^\/assets\/site\.css\?v=[a-f0-9]{16}$/);
  expect(first).toContain('src="/build/missing.js"');
  expect(first).toContain('href="/admin"');
  expect(versionShellAssets('<script src="/assets/../../private.js"></script>', publicPath))
    .toBe('<script src="/assets/../../private.js"></script>');
  const app = express();
  mountStaticAssetRoutes(app, { rootDir, securityConfig: { postMessage: { originToken: {} } } });
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await axios.get(base + firstUrl);
    expect(response.headers['cache-control']).toContain('immutable');
    fs.writeFileSync(filePath, 'body {color: green}');
    const secondUrl = versionShellAssets(shell, publicPath).match(/href="([^"]+)"/)[1];
    expect(secondUrl).not.toBe(firstUrl);
    const stale = await axios.get(base + firstUrl);
    expect(stale.headers['cache-control']).toBe('public, max-age=0');
    const current = await axios.get(base + secondUrl);
    expect(current.headers['cache-control']).toContain('immutable');
    expect(current.data).toContain('green');
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test.each([false, true])('only content-hashed production chunks are immutable (dev=%s)', async devReloadEnabled => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-static-cache-'));
  const buildDir = path.join(rootDir, 'public', 'build');
  fs.mkdirSync(buildDir, { recursive: true });
  const names = ['editor.0123456789abcdef.js', 'pageRenderer.js'];
  names.forEach(name => fs.writeFileSync(path.join(buildDir, name), 'console.log("test");'));
  const app = express();
  mountStaticAssetRoutes(app, { rootDir, devReloadEnabled, securityConfig: { postMessage: { originToken: {} } } });
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}/build/`;
    const hashed = await axios.get(base + names[0]);
    expect(hashed.headers['cache-control']).toBe(devReloadEnabled ? 'public, max-age=0' : 'public, max-age=31536000, immutable');
    const named = await axios.get(base + names[1] + '?v=0123456789abcdef');
    expect(named.headers['cache-control']).toBe('public, max-age=0');
    const revalidated = await axios.get(base + names[1], {
      headers: { 'If-None-Match': named.headers.etag }, validateStatus: () => true
    });
    expect(revalidated.status).toBe(304);
    const missing = await axios.get(base + 'missing.0123456789abcdef.js', { validateStatus: () => true });
    expect(missing.status).toBe(404);
    expect(missing.headers['cache-control'] || '').not.toContain('immutable');
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

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
