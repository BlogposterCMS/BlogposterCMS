'use strict';

const fs = require('fs');
const path = require('path');
const { createFixture } = require('./helpers/coreModuleFixture');
const { collectManagedFiles } = require('../mother/security/runtimeIntegrity');
const { createModuleManifest } = require('../mother/modules/updater/coreModulePackages');
const { buildModuleArchive, extractModuleArchive } = require('../mother/modules/updater/coreModuleArchive');
const { WIDGET_POLICY } = require('../mother/modules/updater/coreWidgetPackages');

test('browser bytes travel in the same verified generation as their backend and retain shared-host checks', () => {
  const f = createFixture();
  try {
    for (const root of [f.rootDir, f.source]) {
      const moduleDir = path.join(root, 'mother/modules/designerManager');
      fs.mkdirSync(moduleDir, { recursive: true });
      fs.writeFileSync(path.join(moduleDir, 'index.js'), 'module.exports = {};');
      fs.writeFileSync(path.join(moduleDir, 'moduleInfo.json'), JSON.stringify({ moduleName: 'designerManager' }));
      fs.mkdirSync(path.join(root, 'public/build'), { recursive: true });
      fs.writeFileSync(path.join(root, 'public/build/designer.js'), root === f.source ? 'new browser' : 'old browser');
      fs.writeFileSync(path.join(root, 'public/build/appBridge.js'), 'shared bridge');
    }
    const runtimeManifest = { ...f.runtimeManifest, files: collectManagedFiles(f.source) };
    const manifest = createModuleManifest({ rootDir: f.source, moduleName: 'designerManager', runtimeManifest });
    expect(manifest.files.some(file => file.path === '__browser__/public/build/designer.js')).toBe(true);
    expect(manifest.files.some(file => file.path.endsWith('appBridge.js'))).toBe(false);
    const archive = buildModuleArchive({ rootDir: f.source, moduleName: 'designerManager',
      moduleDir: path.join(f.source, 'mother/modules/designerManager'), manifest: JSON.stringify(manifest), bundle: '{}' });
    const destination = path.join(f.directory, 'browser-generation');
    extractModuleArchive(archive, 'designerManager', destination);
    expect(f.verify({ rootDir: f.rootDir, generationDir: destination, moduleName: 'designerManager' }).manifest.version).toBe(manifest.version);
    fs.writeFileSync(path.join(f.rootDir, 'public/build/appBridge.js'), 'incompatible shared bridge');
    expect(() => f.verify({ rootDir: f.rootDir, generationDir: destination, moduleName: 'designerManager' })).toThrow('CORE_MODULE_HOST_INCOMPATIBLE');
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

test('bundled widget packages contain only their own browser files and reject backend code', () => {
  const f = createFixture();
  const [moduleName, policy] = Object.entries(WIDGET_POLICY)[0];
  try {
    for (const root of [f.rootDir, f.source]) {
      const filename = path.join(root, policy.entry);
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, root === f.source ? 'export const version = 2;' : 'export const version = 1;');
    }
    const manifest = createModuleManifest({ rootDir: f.source, moduleName, runtimeManifest: { ...f.runtimeManifest, files: collectManagedFiles(f.source) } });
    expect(manifest.files.map(file => file.path)).toEqual(['__browser__/' + policy.entry]);
    const archive = buildModuleArchive({ rootDir: f.source, moduleName, manifest: JSON.stringify(manifest), bundle: '{}' });
    const destination = path.join(f.directory, 'widget-generation');
    extractModuleArchive(archive, moduleName, destination);
    expect(f.verify({ rootDir: f.rootDir, generationDir: destination, moduleName }).manifest.moduleName).toBe(moduleName);
    manifest.files.push({ path: 'index.js', size: 1, sha256: 'a'.repeat(64) });
    expect(() => require('../mother/modules/updater/coreModulePackages').parseManifest(JSON.stringify(manifest), moduleName)).toThrow('CORE_WIDGET_BACKEND_CODE_DENIED');
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});
