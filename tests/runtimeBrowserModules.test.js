const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const express = require('express');
const axios = require('axios');
const { makeFixedTsHandler, makeParamTsHandler, compileBrowserModule } = require('../mother/server/http/runtimeBrowserModules');

let root;
let previousEnv;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-modules-'));
  previousEnv = { NODE_ENV: process.env.NODE_ENV, APP_ENV: process.env.APP_ENV };
  process.env.NODE_ENV = 'production';
  delete process.env.APP_ENV;
  fs.writeFileSync(path.join(root, 'sample.ts'), 'export const value: number = 42;');
  fs.writeFileSync(path.join(root, 'sample.js'), 'export const value = 42;');
});
afterEach(() => {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(root, { recursive: true, force: true });
});

test.each(['NODE_ENV', 'APP_ENV'])('production via %s serves artifacts without ever requiring TypeScript', envKey => {
  // An independent process keeps Jest's own TypeScript transformer out of the measurement.
  const output = execFileSync(process.execPath, ['-e', `
    const Module = require('module');
    const load = Module._load;
    Module._load = function(name, ...args) {
      if (name === 'typescript') throw new Error('Compiler must stay unloaded');
      return load.call(this, name, ...args);
    };
    const { compileBrowserModule } = require('./mother/server/http/runtimeBrowserModules');
    compileBrowserModule(process.argv[1]).then(code => process.stdout.write(code));
  `, path.join(root, 'sample.ts')], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'test', APP_ENV: 'test', [envKey]: 'production' },
    encoding: 'utf8'
  });
  expect(output).toBe('export const value = 42;');
});

test('missing production output fails with a build error instead of compiling', async () => {
  fs.unlinkSync(path.join(root, 'sample.js'));
  await expect(compileBrowserModule(path.join(root, 'sample.ts')))
    .rejects.toMatchObject({ code: 'BROWSER_MODULE_BUILD_MISSING' });
});

test('development recompiles changed TypeScript sources', async () => {
  process.env.NODE_ENV = 'development';
  const sourcePath = path.join(root, 'sample.ts');
  expect(await compileBrowserModule(sourcePath)).toContain('value = 42');
  fs.writeFileSync(sourcePath, 'export const value: number = 43;');
  const future = new Date(Date.now() + 2000);
  fs.utimesSync(sourcePath, future, future);
  expect(await compileBrowserModule(sourcePath)).toContain('value = 43');
});

test('fixed and parameter routes preserve GET, HEAD, headers and invalid-name fallback', async () => {
  const app = express();
  app.get('/fixed.js', makeFixedTsHandler(path.join(root, 'sample.ts')));
  app.get('/modules/:name.js', makeParamTsHandler(root, 'name'));
  const server = app.listen(0);
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const url of ['/fixed.js', '/modules/sample.js']) {
      const response = await axios.get(url, { baseURL });
      expect(response.data).toBe('export const value = 42;');
      expect(response.headers['content-type']).toMatch(/javascript/);
      expect(response.headers['cache-control']).toBe('no-store');
      const head = await axios.head(url, { baseURL });
      expect(head.status).toBe(200);
      expect(head.data).toBe('');
    }
    for (const url of ['/modules/missing.js', '/modules/bad.name.js']) {
      expect((await axios.get(url, { baseURL, validateStatus: () => true })).status).toBe(404);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
