"use strict";

const fs   = require('fs');
const path = require('path');
const {
  ensureAppRegistrySchema,
  registerOrUpdateApp
} = require('./appRegistryService');

async function loadAllApps({ motherEmitter, jwt, baseDir }) {
  const appsPath = baseDir || path.resolve(__dirname, '../../../apps');

  try {
    await ensureAppRegistrySchema(motherEmitter, jwt);
  } catch (err) {
    console.error('[APP LOADER] Failed to ensure schema:', err.message);
    return;
  }

  if (!jwt) {
    console.warn('[APP LOADER] No meltdown JWT => cannot build app registry.');
    return;
  }

  if (!fs.existsSync(appsPath)) {
    console.warn('[APP LOADER] apps dir not found =>', appsPath);
    return;
  }

  const dirs = fs.readdirSync(appsPath, { withFileTypes: true });
  for (const dirent of dirs) {
    if (!dirent.isDirectory()) continue;
    const appName = dirent.name;
    const manifestPath = path.join(appsPath, appName, 'app.json');
    if (!fs.existsSync(manifestPath)) {
      console.warn(`[APP LOADER] Missing app.json for "${appName}"`);
      try {
        await registerOrUpdateApp(motherEmitter, jwt, appName, null, false, 'Missing app.json');
      } catch (err) {
        console.error('[APP LOADER] DB update failed =>', err.message);
      }
      continue;
    }

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      console.warn(`[APP LOADER] Invalid app.json for "${appName}" =>`, err.message);
      try {
        await registerOrUpdateApp(motherEmitter, jwt, appName, null, false, 'Invalid app.json');
      } catch (err2) {
        console.error('[APP LOADER] DB update failed =>', err2.message);
      }
      continue;
    }

    try {
      await registerOrUpdateApp(motherEmitter, jwt, appName, manifest, true, null);
    } catch (err) {
      console.error('[APP LOADER] Failed to register app "'+appName+'" =>', err.message);
    }
  }
}

module.exports = {
  async initialize({ motherEmitter, isCore, jwt, baseDir }) {
    if (!isCore) {
      console.error('[APP LOADER] Must be loaded as a core module.');
      return;
    }

    await loadAllApps({ motherEmitter, jwt, baseDir });
  }
};
