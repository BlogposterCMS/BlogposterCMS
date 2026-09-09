const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const { widgetSandboxAssets } = require('../mother/server/http/widgetSandboxAssets');

let root, server, origin;
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(),'bp-widget-assets-'));
  fs.mkdirSync(path.join(root,'probe'));
  fs.writeFileSync(path.join(root,'probe/widgetInfo.json'),JSON.stringify({widgetId:'probe',uiContractVersion:2}));
  fs.writeFileSync(path.join(root,'probe/widget.js'),'function render(ui) { ui.render({tag:"p",text:"Ready"}); }');
  const app = express(); app.use('/widgets',widgetSandboxAssets(root));
  server = await new Promise(resolve => { const instance = app.listen(0,'127.0.0.1',()=>resolve(instance)); });
  origin = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(root,{recursive:true,force:true}); });

test('community source is non-executable data with no-store and no same-origin import', async () => {
  const response = await fetch(origin+'/widgets/probe/widget.js');
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/plain');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('x-blogposter-widget-contract')).toBe('2');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.text()).toContain('__bpServices');
  expect((await fetch(origin+'/widgets/probe/widgetInfo.json')).status).toBe(403);
});

test('old installations fail closed without changing any package bytes', async () => {
  const manifest = path.join(root,'probe/widgetInfo.json');
  fs.writeFileSync(manifest,'{"widgetId":"probe"}');
  const before = fs.readFileSync(manifest);
  const response = await fetch(origin+'/widgets/probe/widget.js');
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({code:'WIDGET_SANDBOX_MIGRATION_REQUIRED'});
  expect(fs.readFileSync(manifest)).toEqual(before);
  expect(fs.existsSync(path.join(root,'probe/widget.js'))).toBe(true);
});
