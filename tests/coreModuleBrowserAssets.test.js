'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { mountCoreModuleBrowserAssets } = require('../mother/server/http/coreModuleBrowserAssets');
const { ownsBrowserFile } = require('../mother/modules/updater/coreModuleBrowserFiles');

let rootDir, server, base, app, inspect;
const first = 'a'.repeat(64);
const second = 'b'.repeat(64);
beforeEach(async () => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-browser-generations-'));
  const records = new Map();
  for (const generationId of [first, second]) {
    const moduleDir = path.join(rootDir, generationId);
    const browser = path.join(moduleDir, '__browser__');
    fs.mkdirSync(path.join(browser, 'apps/designer'), { recursive: true });
    fs.mkdirSync(path.join(browser, 'public/build'), { recursive: true });
    fs.writeFileSync(path.join(browser, 'apps/designer/index.html'), '<script src="/build/designer.js"></script><script src="/build/appBridge.js"></script>');
    fs.writeFileSync(path.join(browser, 'public/build/designer.js'), `window.version = '${generationId}';`);
    records.set(generationId, { moduleDir, generationId });
  }
  inspect = jest.fn(async request => {
    if (!records.has(request.generationId)) throw new Error('invalid signature');
    return records.get(request.generationId);
  });
  app = express();
  app.locals.coreModuleLifecycle = { browserSelection: () => records.get(second) };
  mountCoreModuleBrowserAssets(app, { rootDir, inspect });
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => {
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  fs.rmSync(rootDir, { recursive: true, force: true });
});

test('new app launches select versioned resources without changing the manifest launch URL', async () => {
  const response = await fetch(base + '/apps/designer/index.html?example=launch', { redirect: 'manual' });
  expect(response.status).toBe(200);
  expect(response.headers.get('location')).toBeNull();
  expect(await response.text()).toContain(`src="/_module-assets/designerManager/${second}/public/build/designer.js"`);
  expect(response.headers.get('cache-control')).toBe('no-store');
});

test('old documents load their original assets after another generation is selected', async () => {
  const old = await fetch(base + `/_module-assets/designerManager/${first}/public/build/designer.js`);
  const current = await fetch(base + `/_module-assets/designerManager/${second}/public/build/designer.js`);
  expect(await old.text()).toContain(first);
  expect(await current.text()).toContain(second);
  expect(old.headers.get('cache-control')).toContain('immutable');
  expect(old.headers.get('access-control-allow-origin')).toBe('*');
  expect(old.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
  expect(inspect).toHaveBeenCalledTimes(2);
});

test.each(['data/private.js', 'mother/modules/auth/index.js', 'apps/designer/app.json', 'ui/designer/source.ts', 'apps/designer/.env'])('never exposes private or non-browser file %s', filename => {
  return fetch(base + `/_module-assets/designerManager/${first}/${filename}`).then(response => expect(response.status).toBe(404));
});

test('unknown generations cannot serve source bytes', async () => {
  const response = await fetch(base + `/_module-assets/designerManager/${'c'.repeat(64)}/public/build/designer.js`);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'CORE_MODULE_BROWSER_ASSET_UNAVAILABLE' });
});

test('asset ownership cannot absorb shared bundles or application permissions', () => {
  expect(ownsBrowserFile('designerManager', 'public/build/designer-app-12345678.js')).toBe(true);
  expect(ownsBrowserFile('designerManager', 'public/build/workspaces.js')).toBe(false);
  expect(ownsBrowserFile('designerManager', 'apps/designer/app.json')).toBe(false);
  expect(ownsBrowserFile('mediaManager', 'ui/designer/app/index.js')).toBe(false);
});

test('widget entry selection is versioned while shared imports retain canonical URLs', async () => {
  const [moduleName, policy] = Object.entries(require('../mother/modules/updater/coreWidgetPackages').WIDGET_POLICY)[0];
  const filename = path.join(rootDir, second, '__browser__', policy.entry);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, 'export const selectedWidget = true;');
  const launch = await fetch(base + '/' + policy.entry, { redirect: 'manual' });
  expect(launch.status).toBe(307);
  expect(launch.headers.get('location')).toBe(`/_module-assets/${moduleName}/${second}/${policy.entry}`);
  const code = await fetch(base + launch.headers.get('location'));
  expect(await code.text()).toBe('export const selectedWidget = true;');
  const shared = await fetch(base + `/_module-assets/${moduleName}/${second}/ui/shared/example.js`, { redirect: 'manual' });
  expect(shared.headers.get('location')).toBe('/ui/shared/example.js');
});

test('concurrent widget loads queue behind bounded verification workers without failing', async () => {
  const widgets = Object.entries(require('../mother/modules/updater/coreWidgetPackages').WIDGET_POLICY).slice(0, 5);
  let active = 0;
  let peak = 0;
  inspect.mockImplementation(async request => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 20));
    active--;
    return { moduleDir: path.join(rootDir, second), generationId: request.generationId };
  });
  for (const [, policy] of widgets) {
    const filename = path.join(rootDir, second, '__browser__', policy.entry);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, 'export const ready = true;');
  }
  const responses = await Promise.all(widgets.map(([name, policy]) =>
    fetch(base + `/_module-assets/${name}/${second}/${policy.entry}`)));
  expect(responses.map(response => response.status)).toEqual([200, 200, 200, 200, 200]);
  expect(peak).toBe(2);
});
