'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEV_RELOAD_ROUTE = '/__dev/reload/events';
const RELOADABLE_EXTENSIONS = new Set([
  '.css',
  '.gif',
  '.html',
  '.ico',
  '.jpeg',
  '.jpg',
  '.js',
  '.json',
  '.mjs',
  '.png',
  '.svg',
  '.ttf',
  '.webp',
  '.woff',
  '.woff2'
]);
const WATCH_TARGETS = Object.freeze([
  { directory: 'apps', publicPrefix: '/apps' },
  { directory: 'public', publicPrefix: '' },
  { directory: 'widgets', publicPrefix: '/widgets' }
]);
const IGNORED_DIRECTORIES = new Set([
  '.agent-worklog',
  '.git',
  'data',
  'node_modules'
]);

function normalizeWebPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/\/+/g, '/');
}

function mapChangedFileToReloadPath(rootDir, filePath) {
  const absoluteFile = path.resolve(filePath);

  for (const target of WATCH_TARGETS) {
    const absoluteRoot = path.resolve(rootDir, target.directory);
    const relativePath = path.relative(absoluteRoot, absoluteFile);
    if (
      relativePath &&
      relativePath !== '..' &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath)
    ) {
      const extension = path.extname(relativePath).toLowerCase();
      if (!RELOADABLE_EXTENSIONS.has(extension)) return null;
      return normalizeWebPath(`${target.publicPrefix}/${relativePath}`);
    }
  }

  return null;
}

function filterReloadPaths(paths) {
  return Array.from(new Set(
    (Array.isArray(paths) ? paths : [])
      .map(normalizeWebPath)
      .filter(Boolean)
      .filter(reloadPath => RELOADABLE_EXTENSIONS.has(path.posix.extname(reloadPath).toLowerCase()))
  )).sort();
}

function writeSseEvent(response, eventName, payload) {
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function createDevReloadHub({ sessionId = crypto.randomUUID() } = {}) {
  const clients = new Set();
  let revision = 0;

  function connect(request, response) {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.flushHeaders?.();
    clients.add(response);
    writeSseEvent(response, 'hello', { sessionId });

    request.once('close', () => {
      clients.delete(response);
    });
  }

  function publish(paths) {
    const reloadPaths = filterReloadPaths(paths);
    if (reloadPaths.length === 0) return false;

    revision += 1;
    const payload = {
      paths: reloadPaths,
      revision: `${Date.now()}-${revision}`
    };
    clients.forEach(client => writeSseEvent(client, 'change', payload));
    return true;
  }

  function heartbeat() {
    clients.forEach(client => client.write(': heartbeat\n\n'));
  }

  function close() {
    clients.forEach(client => client.end());
    clients.clear();
  }

  return {
    close,
    connect,
    heartbeat,
    publish,
    sessionId
  };
}

function createDirectoryWatchers(rootDir, onChange) {
  const watchers = new Map();

  function watchDirectory(directoryPath) {
    if (watchers.has(directoryPath)) return;
    if (!fs.existsSync(directoryPath)) return;

    let entries;
    try {
      entries = fs.readdirSync(directoryPath, { withFileTypes: true });
    } catch (error) {
      console.warn('[DEV_RELOAD_WATCH_READ_ERROR]', directoryPath, error.message);
      return;
    }

    entries.forEach(entry => {
      if (!entry.isDirectory() || IGNORED_DIRECTORIES.has(entry.name)) return;
      watchDirectory(path.join(directoryPath, entry.name));
    });

    try {
      const watcher = fs.watch(directoryPath, { persistent: false }, (_eventType, filename) => {
        if (!filename) return;
        const changedPath = path.join(directoryPath, filename.toString());
        onChange(changedPath);

        try {
          if (fs.existsSync(changedPath) && fs.statSync(changedPath).isDirectory()) {
            watchDirectory(changedPath);
          }
        } catch (error) {
          console.warn('[DEV_RELOAD_WATCH_STAT_ERROR]', changedPath, error.message);
        }
      });
      watcher.on('error', error => {
        console.warn('[DEV_RELOAD_WATCH_ERROR]', directoryPath, error.message);
      });
      watchers.set(directoryPath, watcher);
    } catch (error) {
      console.warn('[DEV_RELOAD_WATCH_START_ERROR]', directoryPath, error.message);
    }
  }

  WATCH_TARGETS.forEach(target => {
    watchDirectory(path.resolve(rootDir, target.directory));
  });

  return () => {
    watchers.forEach(watcher => watcher.close());
    watchers.clear();
  };
}

function mountDevReloadRoutes(app, { enabled, rootDir }) {
  if (!enabled) {
    return { close() {} };
  }

  const hub = createDevReloadHub();
  const pendingPaths = new Set();
  let publishTimer = null;
  const closeWatchers = createDirectoryWatchers(rootDir, changedPath => {
    const reloadPath = mapChangedFileToReloadPath(rootDir, changedPath);
    if (!reloadPath) return;
    pendingPaths.add(reloadPath);
    if (publishTimer) clearTimeout(publishTimer);
    publishTimer = setTimeout(() => {
      publishTimer = null;
      const paths = Array.from(pendingPaths);
      pendingPaths.clear();
      hub.publish(paths);
    }, 120);
    publishTimer.unref?.();
  });
  const heartbeatTimer = setInterval(() => hub.heartbeat(), 20000);
  heartbeatTimer.unref?.();

  app.get(DEV_RELOAD_ROUTE, (request, response) => {
    hub.connect(request, response);
  });
  console.log(`[DEV_RELOAD] Watching browser assets on ${DEV_RELOAD_ROUTE}`);

  return {
    close() {
      if (publishTimer) clearTimeout(publishTimer);
      clearInterval(heartbeatTimer);
      closeWatchers();
      hub.close();
    }
  };
}

module.exports = {
  DEV_RELOAD_ROUTE,
  createDevReloadHub,
  filterReloadPaths,
  mapChangedFileToReloadPath,
  mountDevReloadRoutes
};
