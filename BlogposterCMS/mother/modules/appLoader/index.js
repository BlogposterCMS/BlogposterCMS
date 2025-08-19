"use strict";

const fs   = require('fs');
const path = require('path');
const {
  ensureAppRegistrySchema,
  registerOrUpdateApp
} = require('./appRegistryService');
const { hasPermission } = require('../userManagement/permissionUtils');
const notificationEmitter = require('../../emitters/notificationEmitter');

const notify = (payload) => {
  try {
    notificationEmitter.emit('notify', payload);
  } catch (e) {
    console.error('[NOTIFY-FALLBACK]', payload?.message || payload, e?.message);
  }
};

async function loadAllApps({ motherEmitter, jwt, baseDir }) {
  const appsPath = baseDir || path.resolve(__dirname, '../../../apps');

  try {
    await ensureAppRegistrySchema(motherEmitter, jwt);
  } catch (err) {
    notify({
      moduleName: 'appLoader',
      notificationType: 'system',
      priority: 'error',
      message: `[APP LOADER] Failed to ensure schema: ${err.message}`
    });
    return;
  }

  if (!jwt) {
    notify({
      moduleName: 'appLoader',
      notificationType: 'system',
      priority: 'warning',
      message: '[APP LOADER] No meltdown JWT => cannot build app registry.'
    });
    return;
  }

  if (!fs.existsSync(appsPath)) {
    notify({
      moduleName: 'appLoader',
      notificationType: 'system',
      priority: 'warning',
      message: `[APP LOADER] apps dir not found => ${appsPath}`
    });
    return;
  }

  const dirs = fs.readdirSync(appsPath, { withFileTypes: true });
  for (const dirent of dirs) {
    if (!dirent.isDirectory()) continue;
    const appName = dirent.name;
    const manifestPath = path.join(appsPath, appName, 'app.json');
    if (!fs.existsSync(manifestPath)) {
      notify({
        moduleName: 'appLoader',
        notificationType: 'system',
        priority: 'warning',
        message: `[APP LOADER] Missing app.json for "${appName}"`
      });
      try {
        await registerOrUpdateApp(motherEmitter, jwt, appName, null, false, 'Missing app.json');
      } catch (err) {
        notify({
          moduleName: 'appLoader',
          notificationType: 'system',
          priority: 'error',
          message: `[APP LOADER] DB update failed: ${err.message}`
        });
      }
      continue;
    }

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      notify({
        moduleName: 'appLoader',
        notificationType: 'system',
        priority: 'warning',
        message: `[APP LOADER] Invalid app.json for "${appName}": ${err.message}`
      });
      try {
        await registerOrUpdateApp(motherEmitter, jwt, appName, null, false, 'Invalid app.json');
      } catch (err2) {
        notify({
          moduleName: 'appLoader',
          notificationType: 'system',
          priority: 'error',
          message: `[APP LOADER] DB update failed: ${err2.message}`
        });
      }
      continue;
    }

    const indexPath = path.join(appsPath, appName, 'index.html');
    const hasIndexHtml = fs.existsSync(indexPath);
    const isBuilt = hasIndexHtml; // treat presence of index.html as valid build
    const appInfo = { ...manifest, hasIndexHtml, isBuilt };
    try {
      await registerOrUpdateApp(
        motherEmitter,
        jwt,
        appName,
        appInfo,
        isBuilt,
        hasIndexHtml ? null : 'Missing index.html'
      );
    } catch (err) {
      notify({
        moduleName: 'appLoader',
        notificationType: 'system',
        priority: 'error',
        message: `[APP LOADER] Failed to register app "${appName}": ${err.message}`
      });
    }
  }
}

module.exports = {
  async initialize({ motherEmitter, isCore, jwt, baseDir }) {
    if (!isCore) {
      notify({
        moduleName: 'appLoader',
        notificationType: 'system',
        priority: 'error',
        message: '[APP LOADER] Must be loaded as a core module.'
      });
      return;
    }

    await loadAllApps({ motherEmitter, jwt, baseDir });

    motherEmitter.on('listBuilderApps', async (payload, callback) => {
      try {
        if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'builder.use')) {
          return callback(new Error('Forbidden'));
        }
        const appsPath = baseDir || path.resolve(__dirname, '../../../apps');
        const dirs = fs.existsSync(appsPath)
          ? fs.readdirSync(appsPath, { withFileTypes: true })
          : [];
        const result = [];
        for (const dirent of dirs) {
          if (!dirent.isDirectory()) continue;
          const manifestPath = path.join(appsPath, dirent.name, 'app.json');
          if (!fs.existsSync(manifestPath)) continue;
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            if (
              manifest &&
              Array.isArray(manifest.tags) &&
              manifest.tags.includes('builder')
            ) {
              result.push({
                name: dirent.name,
                title: manifest.title || manifest.name || dirent.name
              });
            }
          } catch {
            // ignore malformed manifest
          }
        }
        callback(null, { apps: result });
      } catch (err) {
        callback(err);
      }
    });

    motherEmitter.on('dispatchAppEvent', (payload, callback) => {
      try {
        motherEmitter.emit('appLoader:appEvent', payload);
        callback(null, { ok: true });
      } catch (err) {
        callback(err);
      }
    });
  }
};
