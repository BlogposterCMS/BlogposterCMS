const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

function sanitizeSlug(str) {
  const cleaned = String(str)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('/')
    .map(seg => seg.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('/');
  return cleaned.substring(0, 96);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

test('GET /admin/app/designer/123 returns iframe with tokens', async () => {
  const app = express();
  const csrfStub = (req, res, next) => { req.csrfToken = () => 'test-token'; next(); };
  app.get('/admin/app/:appName/:pageId?', csrfStub, async (req, res) => {
    const appName = sanitizeSlug(req.params.appName);
    const manifestPath = path.join(__dirname, '..', 'apps', appName, 'app.json');
    if (!fs.existsSync(manifestPath)) return res.status(404).send('App not found');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const titleSafe = escapeHtml(manifest.title || manifest.name || 'App');
    const pageId = sanitizeSlug(req.params.pageId || '');
    const pageQuery = pageId ? `?pageId=${encodeURIComponent(pageId)}` : '';
    const iframeSrc = `/apps/${appName}/index.html${pageQuery}`;
    const indexPath = path.join(__dirname, '..', 'apps', appName, 'index.html');
    if (!fs.existsSync(indexPath)) return res.status(500).send('App build missing');
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${titleSafe}</title><meta name="viewport" content="width=device-width, initial-scale=1"><script src="/build/meltdownEmitter.js"></script><script>window.CSRF_TOKEN='${req.csrfToken()}';</script></head><body class="dashboard-app"><iframe id="app-frame" src="${iframeSrc}" frameborder="0" style="width:100%;height:100vh;overflow:hidden;"></iframe><script>/*postMessage bridge*/</script></body></html>`;
    res.send(html);
  });

  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const res = await axios.get(`http://localhost:${port}/admin/app/designer/123`);
  expect(res.status).toBe(200);
  expect(res.data).toContain("window.CSRF_TOKEN='test-token'");
  expect(res.data).toContain('<iframe id="app-frame" src="/apps/designer/index.html?pageId=123"');
  server.close();
});

test('GET /admin/app/badapp returns error when index missing', async () => {
  const app = express();
  const csrfStub = (req, res, next) => { req.csrfToken = () => 't'; next(); };
  app.get('/admin/app/:appName/:pageId?', csrfStub, async (req, res) => {
    const appName = sanitizeSlug(req.params.appName);
    const manifestPath = path.join(__dirname, '..', 'apps', appName, 'app.json');
    if (!fs.existsSync(manifestPath)) return res.status(404).send('App not found');
    const indexPath = path.join(__dirname, '..', 'apps', appName, 'index.html');
    if (!fs.existsSync(indexPath)) return res.status(500).send('App build missing');
    res.send('ok');
  });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const port = server.address().port;
  const badDir = path.join(__dirname, '..', 'apps', 'badapp');
  fs.mkdirSync(badDir, { recursive: true });
  fs.writeFileSync(path.join(badDir, 'app.json'), '{}');
  const res = await axios.get(`http://localhost:${port}/admin/app/badapp`).catch(e => e.response);
  expect(res.status).toBe(500);
  server.close();
  fs.rmSync(badDir, { recursive: true, force: true });
});
