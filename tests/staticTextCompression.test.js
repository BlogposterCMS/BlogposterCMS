const express = require('express');
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { mountStaticAssetRoutes } = require('../mother/server/http/staticAssets');

describe('canonical static text compression', () => {
  let root;
  let server;
  let base;
  const css = '.fixture { color: red; background: white; }\n'.repeat(1000);
  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-static-compression-'));
    fs.mkdirSync(path.join(root, 'library/public'), { recursive: true });
    fs.writeFileSync(path.join(root, 'library/public/site.css'), css);
    fs.writeFileSync(path.join(root, 'library/public/image.png'), Buffer.alloc(2048, 1));
    const app = express();
    mountStaticAssetRoutes(app, { rootDir: root, securityConfig: { postMessage: { originToken: {} } } });
    app.get('/page', (_req, res) => res.type('html').send('<p>Token-bearing HTML</p>'.repeat(100)));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
    // Only the exact temporary directory created by this test is removed.
    fs.rmSync(root, { recursive: true, force: true });
  });
  test.each(['gzip', 'br'])('negotiates %s while retaining exact CSS bytes and Vary', async encoding => {
    const response = await axios.get(`${base}/media/site.css`, { headers: { 'Accept-Encoding': encoding }, responseType: 'arraybuffer', decompress: false });
    expect(response.headers['content-encoding']).toBe(encoding);
    expect(response.headers.vary).toContain('Accept-Encoding');
    const decoded = encoding === 'br' ? zlib.brotliDecompressSync(response.data) : zlib.gunzipSync(response.data);
    expect(decoded.toString()).toBe(css);
    expect(response.data.length).toBeLessThan(css.length / 2);
  });
  test('retains identity, binary media, byte ranges and dynamic HTML', async () => {
    const identity = await axios.get(`${base}/media/site.css`, { headers: { 'Accept-Encoding': 'identity' } });
    expect(identity.data).toBe(css);
    expect(identity.headers['content-encoding']).toBeUndefined();
    for (const url of ['/media/image.png', '/page']) {
      const response = await axios.get(base + url, { headers: { 'Accept-Encoding': 'gzip' }, decompress: false });
      expect(response.headers['content-encoding']).toBeUndefined();
    }
    const range = await axios.get(`${base}/media/site.css`, { headers: { 'Accept-Encoding': 'gzip', Range: 'bytes=0-9' }, decompress: false });
    expect(range.status).toBe(206);
    expect(range.headers['content-encoding']).toBeUndefined();
    expect(range.data).toBe(css.slice(0, 10));
  });
  test('preserves source-file denial', async () => {
    fs.writeFileSync(path.join(root, 'library/public/secret.ts'), css);
    const response = await axios.get(`${base}/media/secret.ts`, { headers: { 'Accept-Encoding': 'gzip' }, validateStatus: () => true });
    expect(response.status).toBe(404);
    expect(response.headers['content-encoding']).toBeUndefined();
  });
});
