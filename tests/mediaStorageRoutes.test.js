const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { setupStorageRoutes } = require('../mother/modules/mediaManager/storage/routes');

describe('Media storage HTTP publication boundary', () => {
  let directory, originalCwd, server, url, records, stored, saveAttachment, oldLimit;
  const headers = { 'x-role': 'admin', 'x-csrf-token': 'test-csrf' };
  beforeEach(async () => {
    originalCwd = process.cwd(); directory = fs.mkdtempSync(path.join(os.tmpdir(), 'media-routes-test-')); process.chdir(directory);
    oldLimit = process.env.MAX_UPLOAD_BYTES; process.env.MAX_UPLOAD_BYTES = '1024';
    records = []; stored = null;
    fs.mkdirSync(path.join(directory, 'library', 'public'), { recursive: true });
    const app = express();
    saveAttachment = jest.fn(async record => { records.push(record); return { id: 1 }; });
    setupStorageRoutes(app, {
      auth(req, _res, next) { if (req.headers['x-role']) req.user = { id: 1, permissions: req.headers['x-role'] === 'admin' ? { '*': true } : { media: { manage: true } } }; next(); },
      csrf(req, res, next) { if (req.headers['x-csrf-token'] !== 'test-csrf') return res.status(403).json({ error: 'CSRF' }); next(); },
      readSetting: async () => stored, writeSetting: async value => { stored = value; }, saveAttachment,
      resolveSafePath: relative => path.join(directory, 'library', relative), mimeMap: { '.png': 'image/png' }
    });
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    url = `http://127.0.0.1:${server.address().port}/admin/api/media/storage`;
  });
  afterEach(async () => {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    process.chdir(originalCwd); fs.rmSync(directory, { recursive: true, force: true });
    if (oldLimit === undefined) delete process.env.MAX_UPLOAD_BYTES; else process.env.MAX_UPLOAD_BYTES = oldLimit;
  });
  async function upload(content = 'apk bytes', name = 'app.apk', extraHeaders = headers) {
    const body = new FormData(); body.append('appVersion', '2.1.16'); body.append('file', new Blob([content]), name);
    return fetch(`${url}/upload`, { method: 'POST', headers: extraHeaders, body });
  }

  test('auth, media permission, settings permission, and CSRF precede writes', async () => {
    expect((await fetch(url)).status).toBe(403);
    expect((await upload('data', 'app.apk', {})).status).toBe(403);
    expect((await upload('data', 'app.apk', { 'x-role': 'admin' })).status).toBe(403);
    expect((await fetch(url, { method: 'PUT', headers: { ...headers, 'x-role': 'editor', 'content-type': 'application/json' }, body: '{"provider":"local"}' })).status).toBe(403);
    expect(stored).toBeNull(); expect(records).toHaveLength(0);
  });

  test('streams APK and registers the canonical version/checksum/public URL', async () => {
    const response = await upload(); expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.checksum).toBe(crypto.createHash('sha256').update('apk bytes').digest('hex'));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ visibility: 'public', category: 'download', meta: { artifact: { version: '2.1.16' } } });
    expect(fs.readFileSync(path.join(directory, 'library', records[0].storagePath), 'utf8')).toBe('apk bytes');
    expect(result.url).toMatch(/^\/media\/downloads\//);
  });

  test('oversized and forbidden files create no attachment', async () => {
    expect((await upload('x'.repeat(1025))).status).toBe(400);
    expect((await upload('secret', '.env')).status).toBe(400);
    expect(records).toHaveLength(0);
  });

  test('unknown connection ids fail closed instead of publishing to the default', async () => {
    const body = new FormData(); body.append('file', new Blob(['apk']), 'app.apk');
    const response = await fetch(`${url}/upload?connectionId=missing`, { method: 'POST', headers, body });
    expect(await response.json()).toEqual({ error: 'MEDIA_STORAGE_CONNECTION_NOT_FOUND' });
    expect(records).toHaveLength(0);
    expect((await fetch(`${url}/files?connectionId=missing`, { headers })).status).toBe(400);
    expect((await fetch(`${url}/files?connectionId=missing`)).status).toBe(403);
  });

  test('metadata failure compensates the uploaded object', async () => {
    saveAttachment.mockRejectedValue(new Error('database failure'));
    const response = await upload();
    expect(await response.json()).toEqual({ error: 'MEDIA_STORAGE_METADATA_FAILED' });
    const downloads = path.join(directory, 'library', 'public', 'downloads');
    for (const child of fs.readdirSync(downloads)) expect(fs.readdirSync(path.join(downloads, child))).toEqual([]);
  });

  test('saved credentials never return in GET or PUT, and saved local test works', async () => {
    const response = await fetch(url, { method: 'PUT', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ provider: 's3', bucket: 'test-bucket', region: 'eu-central-1', publicBaseUrl: 'https://cdn.example.com', accessKeyId: 'sensitive-id', accessKeySecret: 'sensitive-secret' }) });
    expect(response.status).toBe(200); expect(await response.text()).not.toContain('sensitive');
    expect(await (await fetch(url, { headers })).text()).not.toContain('sensitive');
    expect(JSON.stringify(stored)).not.toContain('sensitive');
    await fetch(url, { method: 'PUT', headers: { ...headers, 'content-type': 'application/json' }, body: '{"provider":"local"}' });
    expect((await fetch(`${url}/test`, { method: 'POST', headers })).status).toBe(200);
  });
});
