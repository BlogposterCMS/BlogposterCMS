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

async function startServer(fakeDesigns, availableEvents = []) {
  const app = express();
  const csrfStub = (req, res, next) => { req.csrfToken = () => 'test-token'; next(); };
  app.get('/admin/app/:appName/:pageId?', csrfStub, async (req, res) => {
    const appName = sanitizeSlug(req.params.appName);
    const manifestPath = path.join(__dirname, '..', 'apps', appName, 'app.json');
    if (!fs.existsSync(manifestPath)) return res.status(404).send('App not found');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const required = Array.isArray(manifest.requiredEvents) ? manifest.requiredEvents : [];
    const missing = required.filter(ev => !availableEvents.includes(ev));
    if (missing.length) {
      return res.status(503).send('Required API events missing: ' + missing.join(', '));
    }
    const idParam = sanitizeSlug(req.params.pageId || '');
    let title = manifest.title || manifest.name || 'App';
    let version = null;
    const design = fakeDesigns[idParam];
    if (appName === 'designer' && idParam && design) {
      title = design.title;
      if (typeof design.version === 'number') {
        version = String(design.version);
      }
    }
    const titleSafe = escapeHtml(title);
    const pageQuery = (appName === 'designer' && idParam)
      ? `?designId=${encodeURIComponent(idParam)}${version ? `&designVersion=${version}` : ''}`
      : (idParam ? `?pageId=${encodeURIComponent(idParam)}` : '');
    const iframeSrc = `/apps/${appName}/index.html${pageQuery}`;
    const indexPath = path.join(__dirname, '..', 'apps', appName, 'index.html');
    if (!fs.existsSync(indexPath)) return res.status(500).send('App build missing');
    const sandbox = 'allow-scripts allow-forms allow-downloads allow-popups allow-modals';
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${titleSafe}</title><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="csrf-token" content="${escapeHtml(req.csrfToken())}"><meta name="admin-token" content="test-admin-token"><meta name="app-name" content="${appName}"><script src="/build/meltdownEmitter.js"></script><script src="/build/openExplorer.js"></script><script type="module" src="/build/appFrameLoader.js"></script></head><body class="dashboard-app"><iframe id="app-frame" src="${iframeSrc}" sandbox="${sandbox}" allow="clipboard-read; clipboard-write" referrerpolicy="origin" frameborder="0" style="width:100%;height:100vh;overflow:hidden;"></iframe></body></html>`;
    res.send(html);
  });
  return new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
}

test('GET /admin/app/designer/123 returns iframe with tokens', async () => {
  const server = await startServer(
    { '123': { title: 'My Design', version: 5 } },
    ['designer.saveDesign', 'designer.listDesigns', 'designer.getDesign']
  );
  const port = server.address().port;
  const res = await axios.get(`http://localhost:${port}/admin/app/designer/123`);
  expect(res.status).toBe(200);
  expect(res.data).toContain('<meta name="csrf-token" content="test-token">');
  expect(res.data).toContain('<iframe id="app-frame" src="/apps/designer/index.html?designId=123&designVersion=5"');
  expect(res.data).toContain('sandbox="allow-scripts allow-forms allow-downloads allow-popups allow-modals"');
  expect(res.data).toContain('<script type="module" src="/build/appFrameLoader.js"></script>');
  expect(res.data).toContain('<title>My Design</title>');
  server.close();
});

test('GET /admin/app/designer/507f1f77bcf86cd799439011 preserves string IDs', async () => {
  const mongoId = '507f1f77bcf86cd799439011';
  const server = await startServer(
    { [mongoId]: { title: 'Hex Design', version: 1 } },
    ['designer.saveDesign', 'designer.listDesigns', 'designer.getDesign']
  );
  const port = server.address().port;
  const res = await axios.get(`http://localhost:${port}/admin/app/designer/${mongoId}`);
  expect(res.status).toBe(200);
  expect(res.data).toContain(`<iframe id="app-frame" src="/apps/designer/index.html?designId=${mongoId}&designVersion=1"`);
  expect(res.data).toContain('<title>Hex Design</title>');
  server.close();
});

test('GET /admin/app/designer warns when required events missing', async () => {
  const server = await startServer({}, []);
  const port = server.address().port;
  const res = await axios.get(`http://localhost:${port}/admin/app/designer`).catch(e => e.response);
  expect(res.status).toBe(503);
  expect(res.data).toMatch(/Required API events missing/i);
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

test('real admin app route keeps app iframe sandboxed', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  expect(appJs).toContain('getAppLaunchInfo');
  expect(appJs).toContain('<script type="module" src="/build/appFrameLoader.js"></script>');
  expect(appJs).toContain('<script type="module" src="/build/agentConsole.js"></script>');
  expect(appJs).toContain('<script src="/build/openExplorer.js"></script>');
  expect(appJs).toContain('<meta name="app-agent-surface" content="${agentSurfaceSafe}">');
  expect(appJs).toContain('manifest.agentSurface');
  expect(appJs).toContain('sandbox="${appSandbox}"');
  expect(appJs).toContain('allow="clipboard-read; clipboard-write"');
  expect(appJs).not.toContain("const manifestPath = path.join(appDir, 'app.json')");
  expect(appJs).not.toContain('/assets/js/appFrameLoader.js');
});

test('real app static route is guarded before serving files', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  expect(appJs).toContain('STATIC_BLOCKED_FILENAMES');
  expect(appJs).toContain('package-lock.json');
  expect(appJs).toContain('^\\.env(?:\\.|$)');
  expect(appJs).toMatch(/const appStaticPath = path\.join\(__dirname, 'apps'\)/);
  expect(appJs).toMatch(/const guardAppStaticRoot = makeStaticRealpathGuard\(appStaticPath, 'apps'\)/);
  expect(appJs).toMatch(
    /app\.use\(\s*['"]\/apps['"]\s*,\s*setStaticCorsHeaders\s*,\s*guardAppStaticRoot\s*,\s*blockBrowserSourceFiles\s*,\s*express\.static\(appStaticPath\)/
  );
});

test('real theme static route blocks executable theme assets', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  expect(appJs).toContain('blockThemeExecutableAssets');
  expect(appJs).toContain('Themes are presentation-only');
  expect(appJs).toMatch(/const themesPath = path\.join\(publicPath, 'themes'\)/);
  expect(appJs).toMatch(/const guardThemeStaticRoot = makeStaticRealpathGuard\(themesPath, 'themes'\)/);
  expect(appJs).toMatch(/\?\:asp\|aspx\|cjs\|js\|jsx\|jsp\|mjs\|php\|phtml\|py\|rb\|sh\|ts\|tsx\|vue\|svelte/);
  expect(appJs).toMatch(
    /app\.use\(\s*['"]\/themes['"]\s*,\s*setStaticCorsHeaders\s*,\s*guardThemeStaticRoot\s*,\s*blockThemeExecutableAssets\s*,\s*express\.static\(themesPath\)/
  );
});
