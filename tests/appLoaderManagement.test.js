const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');

const appLoader = require('../mother/modules/appLoader');

class RegistryEmitter extends EventEmitter {
  constructor() {
    super();
    this.rows = [];
    this.updates = [];
  }

  emit(event, payload, cb) {
    if (event === 'dbSelect') {
      const rawSQL = payload?.data?.rawSQL;
      if (rawSQL === 'SELECT_APP_BY_NAME') {
        const appName = payload.data.appName;
        cb(null, this.rows.filter(row => row.app_name === appName));
        return true;
      }
      if (rawSQL === 'LIST_APP_REGISTRY') {
        cb(null, [...this.rows].sort((a, b) => a.app_name.localeCompare(b.app_name)));
        return true;
      }
      cb(null, []);
      return true;
    }

    if (event === 'dbUpdate') {
      const data = payload?.data || {};
      this.updates.push(data);
      if (data.rawSQL === 'INSERT_APP_REGISTRY_ENTRY' || data.rawSQL === 'UPDATE_APP_REGISTRY_ENTRY') {
        const nextRow = {
          app_name: data.appName,
          is_active: data.isActive ? 1 : 0,
          last_error: data.lastError || null,
          app_info: data.appInfo || '{}'
        };
        const index = this.rows.findIndex(row => row.app_name === data.appName);
        if (index === -1) this.rows.push(nextRow);
        else this.rows[index] = nextRow;
      }
      if (typeof cb === 'function') cb(null, { done: true });
      return true;
    }

    return super.emit(event, payload, cb);
  }
}

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

function appPayload(extra = {}) {
  return {
    jwt: 'app-loader-token',
    moduleName: 'appLoader',
    moduleType: 'core',
    decodedJWT: {
      permissions: {
        apps: { list: true, install: true, delete: true, rescan: true },
        builder: { manage: true, use: true }
      }
    },
    ...extra
  };
}

function createAppFolder(appsRoot, appName, manifest = {}) {
  const appDir = path.join(appsRoot, appName);
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, 'app.json'), JSON.stringify({
    name: appName,
    title: manifest.title || appName,
    tags: manifest.tags || [],
    permissions: manifest.permissions || [],
    ...manifest
  }));
  fs.writeFileSync(path.join(appDir, 'index.html'), '<!doctype html><title>App</title>');
  return appDir;
}

test('app loader lists and reads normalized app registry entries', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const appsRoot = path.join(tmpRoot, 'apps');
  fs.mkdirSync(appsRoot, { recursive: true });
  createAppFolder(appsRoot, 'sourceApp', { title: 'Source App' });

  const emitter = new RegistryEmitter();
  try {
    await appLoader.initialize({
      motherEmitter: emitter,
      isCore: true,
      jwt: 'core-token',
      baseDir: appsRoot
    });

    const list = await emitAsync(emitter, 'listApps', appPayload());
    assert.ifError(list.err);
    const source = list.result.find(row => row.appName === 'sourceApp');
    assert(source);
    assert.strictEqual(source.isActive, true);
    assert.strictEqual(source.appInfo.title, 'Source App');
    assert.strictEqual(source.appInfo.hasIndexHtml, true);

    const one = await emitAsync(emitter, 'getApp', appPayload({ appName: 'sourceApp' }));
    assert.ifError(one.err);
    assert.strictEqual(one.result.appName, 'sourceApp');
    assert.strictEqual(one.result.appInfo.isBuilt, true);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('app loader builder and launch queries use validated app folder shape', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const appsRoot = path.join(tmpRoot, 'apps');
  fs.mkdirSync(appsRoot, { recursive: true });
  createAppFolder(appsRoot, 'validBuilderApp', {
    title: 'Valid Builder App',
    tags: ['builder']
  });
  const invalidDir = createAppFolder(appsRoot, 'mixedBuilderApp', {
    title: 'Mixed Builder App',
    tags: ['builder']
  });
  fs.writeFileSync(path.join(invalidDir, 'widgetInfo.json'), JSON.stringify({
    widgetId: 'mixed-builder-widget',
    widgetType: 'public'
  }));

  const emitter = new RegistryEmitter();
  try {
    await appLoader.initialize({
      motherEmitter: emitter,
      isCore: true,
      jwt: 'core-token',
      baseDir: appsRoot
    });

    const builderApps = await emitAsync(emitter, 'listBuilderApps', appPayload());
    assert.ifError(builderApps.err);
    assert.deepStrictEqual(builderApps.result.apps, [{
      name: 'validBuilderApp',
      title: 'Valid Builder App'
    }]);

    const unscopedBuilderApps = await emitAsync(emitter, 'listBuilderApps', {
      decodedJWT: appPayload().decodedJWT
    });
    assert(unscopedBuilderApps.err);
    assert.match(unscopedBuilderApps.err.message, /invalid payload/);

    const launchInfo = await emitAsync(emitter, 'getAppLaunchInfo', appPayload({ appName: 'validBuilderApp' }));
    assert.ifError(launchInfo.err);
    assert.strictEqual(launchInfo.result.appName, 'validBuilderApp');
    assert.strictEqual(launchInfo.result.isActive, true);
    assert.strictEqual(launchInfo.result.appInfo.title, 'Valid Builder App');

    const mixedLaunch = await emitAsync(emitter, 'getAppLaunchInfo', appPayload({ appName: 'mixedBuilderApp' }));
    assert(mixedLaunch.err);
    assert.match(mixedLaunch.err.message, /widgetInfo\.json/);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('app loader installs and uninstalls apps through a bounded core event', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const appsRoot = path.join(tmpRoot, 'apps');
  fs.mkdirSync(appsRoot, { recursive: true });
  const sourceDir = createAppFolder(appsRoot, 'preparedApp', {
    name: 'installedApp',
    title: 'Prepared App'
  });

  const emitter = new RegistryEmitter();
  try {
    await appLoader.initialize({
      motherEmitter: emitter,
      isCore: true,
      jwt: 'core-token',
      baseDir: appsRoot
    });

    const install = await emitAsync(emitter, 'installAppFromDirectory', appPayload({
      appName: 'installedApp',
      sourceDir
    }));
    assert.ifError(install.err);
    assert.strictEqual(install.result.appName, 'installedApp');
    assert.strictEqual(install.result.isActive, true);
    assert(fs.existsSync(path.join(appsRoot, 'installedApp', 'index.html')));

    const registry = await emitAsync(emitter, 'getApp', appPayload({ appName: 'installedApp' }));
    assert.ifError(registry.err);
    assert.strictEqual(registry.result.appInfo.title, 'Prepared App');

    const blocked = await emitAsync(emitter, 'installAppFromDirectory', appPayload({
      appName: '../escape',
      sourceDir
    }));
    assert(blocked.err);
    assert.match(blocked.err.message, /Invalid app name/);

    const uninstall = await emitAsync(emitter, 'uninstallApp', appPayload({ appName: 'installedApp' }));
    assert.ifError(uninstall.err);
    assert.strictEqual(uninstall.result.isActive, false);
    assert(!fs.existsSync(path.join(appsRoot, 'installedApp')));

    const inactive = await emitAsync(emitter, 'getApp', appPayload({ appName: 'installedApp' }));
    assert.ifError(inactive.err);
    assert.strictEqual(inactive.result.isActive, false);
    assert.strictEqual(inactive.result.lastError, 'Uninstalled');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('app loader refuses to replace or delete core-owned apps', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const appsRoot = path.join(tmpRoot, 'apps');
  fs.mkdirSync(appsRoot, { recursive: true });
  const designerDir = createAppFolder(appsRoot, 'designer', { title: 'Core Designer' });
  const designerIndex = '<!doctype html><title>Core Designer</title>';
  fs.writeFileSync(path.join(designerDir, 'index.html'), designerIndex);
  const sourceDir = createAppFolder(appsRoot, 'designerReplacement', { title: 'Replacement Designer' });

  const emitter = new RegistryEmitter();
  try {
    await appLoader.initialize({
      motherEmitter: emitter,
      isCore: true,
      jwt: 'core-token',
      baseDir: appsRoot
    });

    const install = await emitAsync(emitter, 'installAppFromDirectory', appPayload({
      appName: 'designer',
      sourceDir
    }));
    assert(install.err);
    assert.match(install.err.message, /Core-owned app "designer" cannot be installed or replaced/);
    assert.strictEqual(fs.readFileSync(path.join(designerDir, 'index.html'), 'utf8'), designerIndex);

    const uninstall = await emitAsync(emitter, 'uninstallApp', appPayload({ appName: 'designer' }));
    assert(uninstall.err);
    assert.match(uninstall.err.message, /Core-owned app "designer" cannot be uninstalled/);
    assert(fs.existsSync(path.join(designerDir, 'index.html')));

    const registry = await emitAsync(emitter, 'getApp', appPayload({ appName: 'designer' }));
    assert.ifError(registry.err);
    assert.strictEqual(registry.result.isActive, true);
    assert.strictEqual(registry.result.appInfo.title, 'Core Designer');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('app loader marks invalid app manifests inactive during scan', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const appsRoot = path.join(tmpRoot, 'apps');
  fs.mkdirSync(appsRoot, { recursive: true });
  createAppFolder(appsRoot, 'badWriteApp', {
    allowedEvents: [
      { eventName: 'deleteLocalItem', moduleName: 'mediaManager', moduleType: 'core', access: 'read' }
    ]
  });
  createAppFolder(appsRoot, 'directWriteApp', {
    allowedEvents: [
      { eventName: 'deleteLocalItem', moduleName: 'mediaManager', moduleType: 'core', access: 'write' }
    ]
  });
  createAppFolder(appsRoot, 'tokenIntrospectionApp', {
    allowedEvents: [
      { eventName: 'validateToken', moduleName: 'auth', moduleType: 'core', access: 'read' }
    ]
  });
  createAppFolder(appsRoot, 'userDirectoryApp', {
    allowedEvents: [
      { eventName: 'getAllUsers', moduleName: 'userManagement', moduleType: 'core', access: 'read' }
    ]
  });
  createAppFolder(appsRoot, 'publicSettingsBridgeApp', {
    allowedEvents: [
      { eventName: 'getPublicSettings', moduleName: 'settingsManager', moduleType: 'core', access: 'read' }
    ]
  });
  createAppFolder(appsRoot, 'themeDirectoryApp', {
    allowedEvents: [
      { eventName: 'listThemes', moduleName: 'themeManager', moduleType: 'core', access: 'read' }
    ]
  });
  createAppFolder(appsRoot, 'missingAccessApp', {
    allowedEvents: [
      { eventName: 'designer.getDesign', moduleName: 'designer', moduleType: 'core' }
    ]
  });
  createAppFolder(appsRoot, 'badTargetModuleApp', {
    allowedEvents: [
      { eventName: 'designer.getDesign', moduleName: '../designer', moduleType: 'core', access: 'read' }
    ]
  });
  createAppFolder(appsRoot, 'wrongFacadeModuleApp', {
    allowedEvents: [
      { eventName: 'designer.getDesign', moduleName: 'mediaManager', moduleType: 'core', access: 'read' }
    ]
  });
  createAppFolder(appsRoot, 'wrongManifestNameApp', {
    name: 'someOtherApp'
  });

  const emitter = new RegistryEmitter();
  try {
    await appLoader.initialize({
      motherEmitter: emitter,
      isCore: true,
      jwt: 'core-token',
      baseDir: appsRoot
    });

    const entry = await emitAsync(emitter, 'getApp', appPayload({ appName: 'badWriteApp' }));
    assert.ifError(entry.err);
    assert.strictEqual(entry.result.isActive, false);
    assert.match(entry.result.lastError, /write access/);

    const directEntry = await emitAsync(emitter, 'getApp', appPayload({ appName: 'directWriteApp' }));
    assert.ifError(directEntry.err);
    assert.strictEqual(directEntry.result.isActive, false);
    assert.match(directEntry.result.lastError, /direct write access/);

    const tokenEntry = await emitAsync(emitter, 'getApp', appPayload({ appName: 'tokenIntrospectionApp' }));
    assert.ifError(tokenEntry.err);
    assert.strictEqual(tokenEntry.result.isActive, false);
    assert.match(tokenEntry.result.lastError, /internal event: validateToken/);

    const userDirectoryEntry = await emitAsync(emitter, 'getApp', appPayload({ appName: 'userDirectoryApp' }));
    assert.ifError(userDirectoryEntry.err);
    assert.strictEqual(userDirectoryEntry.result.isActive, false);
    assert.match(userDirectoryEntry.result.lastError, /internal event: getAllUsers/);

    const publicSettingsEntry = await emitAsync(emitter, 'getApp', appPayload({ appName: 'publicSettingsBridgeApp' }));
    assert.ifError(publicSettingsEntry.err);
    assert.strictEqual(publicSettingsEntry.result.isActive, false);
    assert.match(publicSettingsEntry.result.lastError, /internal event: getPublicSettings/);

    const themeDirectoryEntry = await emitAsync(emitter, 'getApp', appPayload({ appName: 'themeDirectoryApp' }));
    assert.ifError(themeDirectoryEntry.err);
    assert.strictEqual(themeDirectoryEntry.result.isActive, false);
    assert.match(themeDirectoryEntry.result.lastError, /internal event: listThemes/);

    const missingAccessEntry = await emitAsync(emitter, 'getApp', appPayload({ appName: 'missingAccessApp' }));
    assert.ifError(missingAccessEntry.err);
    assert.strictEqual(missingAccessEntry.result.isActive, false);
    assert.match(missingAccessEntry.result.lastError, /moduleName, moduleType and access/);

    const badTargetModuleEntry = await emitAsync(emitter, 'getApp', appPayload({ appName: 'badTargetModuleApp' }));
    assert.ifError(badTargetModuleEntry.err);
    assert.strictEqual(badTargetModuleEntry.result.isActive, false);
    assert.match(badTargetModuleEntry.result.lastError, /Invalid app event moduleName/);

    const wrongFacadeModuleEntry = await emitAsync(emitter, 'getApp', appPayload({ appName: 'wrongFacadeModuleApp' }));
    assert.ifError(wrongFacadeModuleEntry.err);
    assert.strictEqual(wrongFacadeModuleEntry.result.isActive, false);
    assert.match(wrongFacadeModuleEntry.result.lastError, /does not match runtime facade resource/);

    const wrongManifestNameEntry = await emitAsync(emitter, 'getApp', appPayload({ appName: 'wrongManifestNameApp' }));
    assert.ifError(wrongManifestNameEntry.err);
    assert.strictEqual(wrongManifestNameEntry.result.isActive, false);
    assert.match(wrongManifestNameEntry.result.lastError, /must match app folder/);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('app loader rejects ambiguous app bridge event manifests', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const appsRoot = path.join(tmpRoot, 'apps');
  fs.mkdirSync(appsRoot, { recursive: true });
  createAppFolder(appsRoot, 'stringEventApp', {
    allowedEvents: ['getThing']
  });
  createAppFolder(appsRoot, 'communityTargetApp', {
    allowedEvents: [
      { eventName: 'getThing', moduleName: 'demoModule', moduleType: 'community', access: 'read' }
    ]
  });

  const emitter = new RegistryEmitter();
  try {
    await appLoader.initialize({
      motherEmitter: emitter,
      isCore: true,
      jwt: 'core-token',
      baseDir: appsRoot
    });

    const stringEntry = await emitAsync(emitter, 'getApp', appPayload({ appName: 'stringEventApp' }));
    assert.ifError(stringEntry.err);
    assert.strictEqual(stringEntry.result.isActive, false);
    assert.match(stringEntry.result.lastError, /must be an object/);

    const communityEntry = await emitAsync(emitter, 'getApp', appPayload({ appName: 'communityTargetApp' }));
    assert.ifError(communityEntry.err);
    assert.strictEqual(communityEntry.result.isActive, false);
    assert.match(communityEntry.result.lastError, /core module contract/);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('app loader rejects app folders that contain module metadata', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const appsRoot = path.join(tmpRoot, 'apps');
  fs.mkdirSync(appsRoot, { recursive: true });
  const appDir = createAppFolder(appsRoot, 'mixedShapeApp');
  fs.writeFileSync(path.join(appDir, 'moduleInfo.json'), JSON.stringify({
    moduleName: 'mixedShapeApp',
    version: '1.0.0',
    developer: 'Test',
    description: 'Wrong shape'
  }));

  const emitter = new RegistryEmitter();
  try {
    await appLoader.initialize({
      motherEmitter: emitter,
      isCore: true,
      jwt: 'core-token',
      baseDir: appsRoot
    });

    const entry = await emitAsync(emitter, 'getApp', appPayload({ appName: 'mixedShapeApp' }));
    assert.ifError(entry.err);
    assert.strictEqual(entry.result.isActive, false);
    assert.match(entry.result.lastError, /moduleInfo\.json/);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('app loader rejects app folders that contain widget metadata', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const appsRoot = path.join(tmpRoot, 'apps');
  fs.mkdirSync(appsRoot, { recursive: true });
  const appDir = createAppFolder(appsRoot, 'widgetShapeApp');
  fs.writeFileSync(path.join(appDir, 'widgetInfo.json'), JSON.stringify({
    name: 'widgetShapeApp',
    widgetType: 'public',
    description: 'Wrong shape'
  }));

  const emitter = new RegistryEmitter();
  try {
    await appLoader.initialize({
      motherEmitter: emitter,
      isCore: true,
      jwt: 'core-token',
      baseDir: appsRoot
    });

    const entry = await emitAsync(emitter, 'getApp', appPayload({ appName: 'widgetShapeApp' }));
    assert.ifError(entry.err);
    assert.strictEqual(entry.result.isActive, false);
    assert.match(entry.result.lastError, /widgetInfo\.json/);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('app loader rejects nested module or widget metadata inside app folders', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const appsRoot = path.join(tmpRoot, 'apps');
  fs.mkdirSync(appsRoot, { recursive: true });
  const moduleMixedDir = path.join(createAppFolder(appsRoot, 'nestedModuleShapeApp'), 'embedded-module');
  const widgetMixedDir = path.join(createAppFolder(appsRoot, 'nestedWidgetShapeApp'), 'embedded-widget');
  fs.mkdirSync(moduleMixedDir, { recursive: true });
  fs.mkdirSync(widgetMixedDir, { recursive: true });
  fs.writeFileSync(path.join(moduleMixedDir, 'moduleInfo.json'), JSON.stringify({
    moduleName: 'embedded-module',
    version: '1.0.0'
  }));
  fs.writeFileSync(path.join(widgetMixedDir, 'widgetInfo.json'), JSON.stringify({
    widgetId: 'embedded-widget',
    widgetType: 'public'
  }));

  const emitter = new RegistryEmitter();
  try {
    await appLoader.initialize({
      motherEmitter: emitter,
      isCore: true,
      jwt: 'core-token',
      baseDir: appsRoot
    });

    const moduleEntry = await emitAsync(emitter, 'getApp', appPayload({ appName: 'nestedModuleShapeApp' }));
    assert.ifError(moduleEntry.err);
    assert.strictEqual(moduleEntry.result.isActive, false);
    assert.match(moduleEntry.result.lastError, /moduleInfo\.json/);

    const widgetEntry = await emitAsync(emitter, 'getApp', appPayload({ appName: 'nestedWidgetShapeApp' }));
    assert.ifError(widgetEntry.err);
    assert.strictEqual(widgetEntry.result.isActive, false);
    assert.match(widgetEntry.result.lastError, /widgetInfo\.json/);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('app install validates source shape before replacing an existing app', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const appsRoot = path.join(tmpRoot, 'apps');
  fs.mkdirSync(appsRoot, { recursive: true });
  const existingDir = createAppFolder(appsRoot, 'installedApp', { title: 'Existing App' });
  fs.writeFileSync(path.join(existingDir, 'index.html'), '<!doctype html><title>Existing App</title>');
  const badSourceDir = createAppFolder(appsRoot, 'badSourceApp', { title: 'Bad Source App' });
  fs.writeFileSync(path.join(badSourceDir, 'widgetInfo.json'), JSON.stringify({
    name: 'badSourceApp',
    widgetType: 'public'
  }));

  const emitter = new RegistryEmitter();
  try {
    await appLoader.initialize({
      motherEmitter: emitter,
      isCore: true,
      jwt: 'core-token',
      baseDir: appsRoot
    });

    const install = await emitAsync(emitter, 'installAppFromDirectory', appPayload({
      appName: 'installedApp',
      sourceDir: badSourceDir
    }));
    assert(install.err);
    assert.match(install.err.message, /widgetInfo\.json/);
    assert.strictEqual(
      fs.readFileSync(path.join(existingDir, 'index.html'), 'utf8'),
      '<!doctype html><title>Existing App</title>'
    );

    const existing = await emitAsync(emitter, 'getApp', appPayload({ appName: 'installedApp' }));
    assert.ifError(existing.err);
    assert.strictEqual(existing.result.appInfo.title, 'Existing App');
    assert.strictEqual(existing.result.isActive, true);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('app install rejects source directories whose real path escapes the apps root', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const appsRoot = path.join(tmpRoot, 'apps');
  const outsideDir = path.join(tmpRoot, 'outside-source');
  const linkDir = path.join(appsRoot, 'linkedSource');
  fs.mkdirSync(appsRoot, { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });
  fs.writeFileSync(path.join(outsideDir, 'app.json'), JSON.stringify({
    name: 'linkedSource',
    title: 'Linked Source'
  }));
  fs.writeFileSync(path.join(outsideDir, 'index.html'), '<!doctype html><title>Linked</title>');

  try {
    try {
      fs.symlinkSync(outsideDir, linkDir, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      return;
    }

    await assert.rejects(
      () => appLoader._internals.installAppFromDirectory({
        motherEmitter: new RegistryEmitter(),
        jwt: 'core-token',
        appsPath: appsRoot,
        appName: 'linkedInstall',
        sourceDir: linkDir
      }),
      /source directory escapes apps root/
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('app install rejects source folders that contain linked paths', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const appsRoot = path.join(tmpRoot, 'apps');
  const outsideDir = path.join(tmpRoot, 'outside-assets');
  fs.mkdirSync(appsRoot, { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });
  const sourceDir = createAppFolder(appsRoot, 'linkedContentSource', { title: 'Linked Content Source' });
  const linkDir = path.join(sourceDir, 'linked-assets');

  try {
    try {
      fs.symlinkSync(outsideDir, linkDir, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      return;
    }

    await assert.rejects(
      () => appLoader._internals.installAppFromDirectory({
        motherEmitter: new RegistryEmitter(),
        jwt: 'core-token',
        appsPath: appsRoot,
        appName: 'linkedContentInstall',
        sourceDir
      }),
      /cannot contain symlinks or junctions/
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
