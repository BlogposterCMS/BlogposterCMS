/** @jest-environment node */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWatchPolicy, startServerWatcher } = require('../tools/dev-server');
const config = require('../nodemon.json');

test('server watch policy preserves extensions, generated exclusions and watched roots', () => {
  const root = path.resolve('watch-fixture');
  const policy = createWatchPolicy(config, root);
  for (const file of ['app.js', 'config/site.json', 'mother/module/index.ts']) {
    expect(policy.shouldRestart(path.join(root, file))).toBe(true);
  }
  for (const file of ['data/a.sqlite', 'public/build/app.js', 'mother/modules/notificationManager/integrationsRegistry.json',
    'mother/modules/databaseManager/placeholders/placeholderData.json', 'mother/modules/notificationManager/test.log',
    'mother/module/README.md', 'modules/node_modules/library/index.js']) {
    expect(policy.shouldRestart(path.join(root, file))).toBe(false);
  }
  expect(config.watch).not.toContain('public');
  expect(config.watch).not.toContain('apps');
});

test('real watcher restarts source changes and stops its child without restarting generated files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blogposter-dev-watch-'));
  fs.mkdirSync(path.join(root, 'config'));
  fs.mkdirSync(path.join(root, 'mother/modules/notificationManager'), { recursive: true });
  const countFile = path.join(root, 'starts.log');
  fs.writeFileSync(path.join(root, 'app.js'), `require('fs').appendFileSync('starts.log', process.pid+'\\n');setInterval(()=>{},1000);`);
  fs.writeFileSync(path.join(root, 'config/site.json'), '{}');
  fs.writeFileSync(path.join(root, 'mother/modules/notificationManager/integrationsRegistry.json'), '{}');
  const server = startServerWatcher(root);
  const count = () => fs.existsSync(countFile) ? fs.readFileSync(countFile, 'utf8').trim().split('\n').length : 0;
  async function waitFor(predicate) {
    const deadline = Date.now() + 5000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error('DEV_WATCH_TEST_TIMEOUT');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  try {
    await new Promise(resolve => server.watcher.once('ready', resolve));
    await waitFor(() => count() === 1);
    fs.writeFileSync(path.join(root, 'config/site.json'), '{"changed":true}');
    await waitFor(() => count() === 2);
    fs.writeFileSync(path.join(root, 'mother/modules/notificationManager/integrationsRegistry.json'), '{"generated":true}');
    await new Promise(resolve => setTimeout(resolve, 350));
    expect(count()).toBe(2);
  } finally {
    server.stop();
    const pids = fs.existsSync(countFile) ? fs.readFileSync(countFile, 'utf8').trim().split('\n').map(Number) : [];
    await waitFor(() => pids.every(pid => {
      try { process.kill(pid, 0); return false; } catch (error) { return error.code === 'ESRCH'; }
    }));
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 15000);
