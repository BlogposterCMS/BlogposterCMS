const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

function sanitizeSlug(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 96);
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

test('GET /admin/app/designer/123 returns 200 with csrf token', async () => {
  const app = express();
  const csrfStub = (req, res, next) => { req.csrfToken = () => 'test-token'; next(); };
  app.get('/admin/app/:appName/:pageId?', csrfStub, async (req, res) => {
    const appName = sanitizeSlug(req.params.appName);
    const appDir = path.join(__dirname, '..', 'apps', appName);
    const manifestPath = path.join(appDir, 'app.json');
    if (!fs.existsSync(manifestPath)) return res.status(404).send('App not found');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const titleSafe = escapeHtml(manifest.title || manifest.name || 'App');
    const rawEntry = String(manifest.entry || '').replace(/[^a-zA-Z0-9_\-/\.]/g, '');
    const entry = rawEntry.includes('/') || rawEntry.endsWith('.js')
      ? rawEntry
      : `build/${rawEntry}.js`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="csrf-token" content="${req.csrfToken()}"><title>${titleSafe}</title><link rel="stylesheet" href="/assets/css/site.css"></head><body><div id="sidebar"></div><div id="content"></div><script type="module" src="/${entry}"></script></body></html>`;
    res.send(html);
  });

  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const res = await axios.get(`http://localhost:${port}/admin/app/designer/123`);
  expect(res.status).toBe(200);
  expect(res.data).toContain('<meta name="csrf-token" content="test-token">');
  server.close();
});
