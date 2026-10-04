'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');
const chokidar = require('chokidar');
const picomatch = require('picomatch');
const config = require('../nodemon.json');

function createWatchPolicy(settings, root) {
  const ignored = picomatch(['**/node_modules/**', '**/.git/**', ...settings.ignore], { dot: true });
  const extensions = new Set(settings.ext.split(','));
  const relative = file => path.relative(root, file).split(path.sep).join('/');
  return {
    ignored: file => ignored(relative(file)),
    shouldRestart: file => !ignored(relative(file)) && extensions.has(path.extname(file).slice(1))
  };
}

function startServerWatcher(root = path.resolve(__dirname, '..')) {
  const policy = createWatchPolicy(config, root);
  let child;
  let stopping = false;
  let restartPending = false;
  let timer;
  const onSignal = () => stop();
  const watcher = chokidar.watch(config.watch.map(file => path.join(root, file)), {
    ignoreInitial: true, ignored: policy.ignored
  });
  function launch() {
    child = spawn(process.execPath, ['app.js'], {
      cwd: root, env: { ...process.env, BLOGPOSTER_DEV_RELOAD: 'true' },
      stdio: 'inherit', windowsHide: true
    });
    child.once('error', error => {
      console.error('[DEV_SERVER_START_FAILED]', error);
      stop(1);
    });
    child.once('exit', (code, signal) => {
      child = undefined;
      if (stopping) return;
      // Wait for the old process to release its port before starting a replacement.
      if (restartPending) { restartPending = false; launch(); }
      else console.error('[DEV_SERVER_EXIT] Waiting for a source change.', signal || code);
    });
  }
  function restart() {
    if (stopping || restartPending) return;
    if (!child) return launch();
    restartPending = true;
    child.kill();
  }
  function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    clearTimeout(timer);
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    watcher.close().catch(error => console.error('[DEV_SERVER_WATCH_CLOSE_FAILED]', error));
    if (child) child.kill();
    process.exitCode = code;
  }
  watcher.on('all', (event, file) => {
    if (!['add', 'change', 'unlink'].includes(event) || !policy.shouldRestart(file)) return;
    clearTimeout(timer);
    timer = setTimeout(restart, 100);
  });
  watcher.on('error', error => { console.error('[DEV_SERVER_WATCH_FAILED]', error); stop(1); });
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  launch();
  return { stop, watcher };
}

if (require.main === module) startServerWatcher();
module.exports = { createWatchPolicy, startServerWatcher };
