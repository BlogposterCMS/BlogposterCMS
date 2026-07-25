'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const children = new Set();
let stopping = false;

function resolvePackageBin(packageName) {
  let currentDir = path.dirname(require.resolve(packageName));

  while (currentDir !== path.dirname(currentDir)) {
    const packagePath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packagePath)) {
      const manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      if (manifest.name === packageName) {
        const binValue = typeof manifest.bin === 'string'
          ? manifest.bin
          : manifest.bin?.[packageName];
        if (!binValue) {
          throw new Error(`DEV_RUNNER_BIN_MISSING: ${packageName} has no executable.`);
        }
        return path.resolve(currentDir, binValue);
      }
    }
    currentDir = path.dirname(currentDir);
  }

  throw new Error(`DEV_RUNNER_PACKAGE_MISSING: Cannot resolve ${packageName}.`);
}

function stopChildren() {
  if (stopping) return;
  stopping = true;
  children.forEach(child => {
    if (!child.killed) child.kill();
  });
}

function startProcess(label, packageName, args) {
  const binPath = resolvePackageBin(packageName);
  const child = spawn(process.execPath, [binPath, ...args], {
    cwd: rootDir,
    env: {
      ...process.env,
      BLOGPOSTER_DEV_RELOAD: 'true'
    },
    stdio: 'inherit',
    windowsHide: true
  });
  children.add(child);

  child.once('error', error => {
    console.error(`[DEV_RUNNER_${label.toUpperCase()}_ERROR]`, error);
    stopChildren();
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (stopping) return;
    console.error(
      `[DEV_RUNNER_${label.toUpperCase()}_EXIT] ${label} stopped`,
      signal ? `with signal ${signal}` : `with code ${code}`
    );
    stopChildren();
    process.exitCode = typeof code === 'number' && code !== 0 ? code : 1;
  });
}

process.once('SIGINT', stopChildren);
process.once('SIGTERM', stopChildren);
process.once('exit', stopChildren);

startProcess('styles', 'sass', [
  '--watch',
  '--style=expanded',
  '--source-map',
  'public/assets/scss/site.scss:public/assets/css/site.css',
  'apps/designer/assets/scss/designer.scss:apps/designer/assets/css/designer.css'
]);
// Keep the watch output byte-compatible with the checked-in production build.
// Development-mode chunk names would continuously dirty and delete build files.
startProcess('browser', 'webpack-cli', ['--watch', '--mode', 'production']);
startProcess('server', 'nodemon', ['app.js']);
