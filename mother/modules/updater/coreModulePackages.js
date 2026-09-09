'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { readModuleReleaseNotes, MAX_RELEASE_NOTES_BYTES } = require('./coreModuleReleaseNotes');
const { BROWSER_PREFIX, ownsBrowserFile, browserRecords } = require('./coreModuleBrowserFiles');
const { WIDGET_POLICY } = require('./coreWidgetPackages');
const { collectManagedFiles, verifyAttestation, TRUSTED_REPOSITORY } = require('../../security/runtimeIntegrity');

// Host-owned policy: package metadata cannot opt another module into hot loading.
// Schema/bootstrap helpers stay in the host compatibility fingerprint.
const MODULE_POLICY = Object.freeze({
  translationManager: Object.freeze({ hostFiles: ['dbInit.js'] }),
  contentEngine: Object.freeze({ hostFiles: ['contentService.js'] }),
  searchManager: Object.freeze({ hostFiles: ['searchService.js'] }),
  workflowManager: Object.freeze({ hostFiles: ['workflowService.js'] }),
  exportManager: Object.freeze({ hostFiles: [] }),
  mediaManager: Object.freeze({ hostFiles: ['mediaService.js'] }),
  designerManager: Object.freeze({ hostFiles: ['dbPlaceholders.js', 'schemaDefinition.json'] }),
  metadataManager: Object.freeze({ hostFiles: ['metadataService.js'] }),
  commentsManager: Object.freeze({ hostFiles: ['commentsService.js'] }),
  navigationManager: Object.freeze({ hostFiles: ['navigationService.js'] }),
  seoManager: Object.freeze({ hostFiles: ['seoService.js'] }),
  redirectManager: Object.freeze({ hostFiles: ['redirectService.js'] }),
  colorLibrary: Object.freeze({ hostFiles: ['colorLibraryService.js'] }),
  fontPackages: Object.freeze({ hostFiles: ['fontPackagesService.js'] }),
  sitePresets: Object.freeze({ hostFiles: ['sitePresetsService.js'] }),
  settingsManager: Object.freeze({ hostFiles: ['settingsService.js'] }),
  geoipManager: Object.freeze({ hostFiles: ['service.js'], hostDirectories: ['providers'] }),
  requestManager: Object.freeze({ hostFiles: ['outboundPolicy.js'] }),
  dependencyLoader: Object.freeze({ hostFiles: ['dependencyLoaderService.js'] }),
  agentAccess: Object.freeze({ hostFiles: ['accessCodeState.js'] }),
  agentManager: Object.freeze({ hostFiles: ['surfaceState.js', 'apiDefinition.json', 'httpApi.js'] }),
  analyticsManager: Object.freeze({ hostFiles: ['runtimeState.js', 'collector.js', 'domain.js'] }),
  databaseManager: Object.freeze({ hostFiles: ['dbSetup.js', 'meltdownBridging/databaseEventBoundary.js'], hostDirectories: ['engines', 'config', 'helpers', 'placeholders'] }),
  auth: Object.freeze({ hostFiles: ['authService.js', 'authMiddleware.js', 'permissionMiddleware.js', 'devAutoLogin.js'], hostDirectories: ['strategies'] }),
  runtimeManager: Object.freeze({ hostFiles: ['publicWidgetServices.js'], hostDirectories: ['facades'] }),
  fontsManager: Object.freeze({ hostFiles: [], hostDirectories: ['strategies', 'config'] }),
  notificationManager: Object.freeze({ hostFiles: ['notificationDelivery.js', 'notificationManagerService.js', 'integrationsRegistry.json'], hostDirectories: ['integrations'] }),
  updater: Object.freeze({ hostFiles: ['coreUpdateService.js', 'updateScheduler.js', 'coreModuleWorker.js', 'coreModuleUpdates.js', 'coreModuleStore.js', 'coreModuleReleaseNotes.js', 'coreModulePackages.js', 'coreModuleBrowserFiles.js', 'coreWidgetPackages.js', 'coreModuleArchive.js'] }),
  unifiedSettings: Object.freeze({ hostFiles: ['registryState.js'] }),
  serverManager: Object.freeze({ hostFiles: ['serverManagerService.js'] }),
  importer: Object.freeze({ hostFiles: ['importRoots.js'] }),
  shareManager: Object.freeze({ hostFiles: ['shareService.js'] }),
  plainSpace: Object.freeze({ hostFiles: ['hostRoot.js', 'plainSpaceService.js', 'config/adminPages.js', 'config/defaultWidgets.js'] }),
  pagesManager: Object.freeze({ hostFiles: ['pagesService.js', 'publicPresentation.js', 'comingSoonSeed.js'] }),
  userManagement: Object.freeze({ hostFiles: ['userInitService.js', 'permissionUtils.js', 'userAccessService.js'] }),
  appLoader: Object.freeze({ hostFiles: ['appRoot.js', 'appRegistryService.js'] }),
  widgetManager: Object.freeze({ hostFiles: ['widgetRoot.js', 'widgetPackageService.js', 'widgetPackageAccess.js', 'widgetSandboxSource.js', 'widgetPackageFiles.js', 'widgetDesignContract.js'] }),
  ...WIDGET_POLICY
});
const HASH = /^[a-f0-9]{64}$/;
// Release CI also creates preview artifacts; normal discovery remains stable-only.
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const MAX_FILES = 10000;
const MAX_BYTES = 64 * 1024 * 1024;

function packageError(code, message = code) {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function supportedModule(moduleName) {
  if (!Object.prototype.hasOwnProperty.call(MODULE_POLICY, moduleName)) throw packageError('CORE_MODULE_RESTART_REQUIRED', String(moduleName));
  return MODULE_POLICY[moduleName];
}
function hotFile(filename) {
  return Object.keys(MODULE_POLICY).some(name => {
    const prefix = `mother/modules/${name}/`;
    const policy = MODULE_POLICY[name];
    // Widget notes are signed package metadata, not a shared runtime contract.
    // Editing only a widget changelog must not force every module to update its host.
    const widgetNotes = policy.kind === 'widget' && filename === policy.entry.replace(/\.js$/, '.CHANGELOG.md');
    return widgetNotes || ownsBrowserFile(name, filename) || (filename.startsWith(prefix) && !isHostFile(name, filename.slice(prefix.length)));
  });
}

function isHostFile(moduleName, filename) {
  const policy = MODULE_POLICY[moduleName];
  return Boolean(policy && (policy.hostFiles.includes(filename) ||
    policy.hostDirectories?.some(directory => filename.startsWith(`${directory}/`))));
}

/** Version-only package changes do not invalidate a host; dependency changes do. */
function hostFingerprint(files, packageInfo, lockfiles = {}) {
  const normalizedPackage = { ...packageInfo };
  delete normalizedPackage.version;
  // Release text is signed for integrity, but does not change host interfaces.
  const records = files.filter(record => record.path !== 'CHANGELOG.md' && record.path !== 'package.json' && !Object.prototype.hasOwnProperty.call(lockfiles, record.path) && !hotFile(record.path))
    .map(record => [record.path, record.size, record.sha256]);
  records.push(['package.json', hash(JSON.stringify(stable(normalizedPackage)))]);
  for (const [filename, lockfile] of Object.entries(lockfiles)) {
    const normalized = JSON.parse(JSON.stringify(lockfile));
    delete normalized.version;
    if (normalized.packages?.['']) delete normalized.packages[''].version;
    records.push([filename, hash(JSON.stringify(stable(normalized)))]);
  }
  records.sort((a, b) => a[0].localeCompare(b[0]));
  return hash(JSON.stringify(records));
}

function fingerprintRoot(rootDir, files) {
  const lockfiles = {};
  for (const filename of ['package-lock.json', 'node_modules/.package-lock.json']) {
    if (fs.existsSync(path.join(rootDir, filename))) lockfiles[filename] = JSON.parse(fs.readFileSync(path.join(rootDir, filename), 'utf8'));
  }
  return hostFingerprint(files, JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')), lockfiles);
}

function parseManifest(raw, moduleName) {
  const policy = supportedModule(moduleName);
  let manifest;
  try { manifest = JSON.parse(String(raw)); }
  catch { throw packageError('CORE_MODULE_MANIFEST_INVALID'); }
  if (manifest?.schemaVersion !== 1 || manifest.product !== 'blogpostercms-core-module' ||
      manifest.moduleName !== moduleName || !VERSION.test(manifest.version || '') ||
      manifest.source?.repository !== TRUSTED_REPOSITORY || !/^[a-f0-9]{40}$/.test(manifest.source?.commit || '') ||
      manifest.source?.tag !== `v${manifest.version}` || !HASH.test(manifest.hostFingerprint || '') ||
      !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > MAX_FILES) {
    throw packageError('CORE_MODULE_MANIFEST_INVALID');
  }
  const seen = new Set();
  // Optional for previously published packages; never accept malformed review data.
  if ((manifest.releaseNotes !== undefined && (typeof manifest.releaseNotes !== 'string' ||
      Buffer.byteLength(manifest.releaseNotes, 'utf8') > MAX_RELEASE_NOTES_BYTES)) ||
      (manifest.breakingChange !== undefined && typeof manifest.breakingChange !== 'boolean')) {
    throw packageError('CORE_MODULE_RELEASE_NOTES_INVALID');
  }
  let size = 0;
  for (const record of manifest.files) {
    const filename = record?.path;
    if (typeof filename !== 'string' || !/^[A-Za-z0-9_.\/-]+$/.test(filename) ||
        filename.split('/').some(part => !part || part === '.' || part === '..' || part.endsWith('.')) ||
        path.isAbsolute(filename) || seen.has(filename.toLowerCase()) ||
        !HASH.test(record.sha256 || '') || !Number.isSafeInteger(record.size) || record.size < 0) {
      throw packageError('CORE_MODULE_MANIFEST_FILE_INVALID');
    }
    if (filename.startsWith(BROWSER_PREFIX) && !ownsBrowserFile(moduleName, filename.slice(BROWSER_PREFIX.length))) {
      throw packageError('CORE_MODULE_BROWSER_FILE_DENIED');
    }
    if (policy.kind === 'widget' && !filename.startsWith(BROWSER_PREFIX)) throw packageError('CORE_WIDGET_BACKEND_CODE_DENIED');
    seen.add(filename.toLowerCase()); size += record.size;
  }
  const required = policy.kind === 'widget' ? [BROWSER_PREFIX + policy.entry] : ['index.js', 'moduleInfo.json'];
  if (size > MAX_BYTES || required.some(filename => !manifest.files.some(record => record.path === filename))) throw packageError('CORE_MODULE_MANIFEST_FILE_INVALID');
  return manifest;
}

function moduleFiles(moduleDir) {
  const root = path.resolve(moduleDir);
  if (fs.lstatSync(root).isSymbolicLink()) throw packageError('CORE_MODULE_PACKAGE_SYMLINK');
  const records = [];
  let size = 0;
  let entries = 0;
  function visit(directory, prefix = '') {
    if (prefix.split('/').length > 32) throw packageError('CORE_MODULE_PACKAGE_TOO_DEEP');
    for (const name of fs.readdirSync(directory)) {
      if (++entries > MAX_FILES) throw packageError('CORE_MODULE_PACKAGE_TOO_LARGE');
      const filename = path.join(directory, name);
      const stat = fs.lstatSync(filename);
      if (stat.isSymbolicLink()) throw packageError('CORE_MODULE_PACKAGE_SYMLINK');
      const relative = `${prefix}${name}`;
      if (stat.isDirectory()) visit(filename, `${relative}/`);
      else {
        if (!stat.isFile() || records.length >= MAX_FILES || (size += stat.size) > MAX_BYTES) throw packageError('CORE_MODULE_PACKAGE_TOO_LARGE');
        records.push({ path: relative, size: stat.size, sha256: hash(fs.readFileSync(filename)) });
      }
    }
  }
  visit(root);
  return records.sort((a, b) => a.path.localeCompare(b.path));
}

function createModuleManifest({ rootDir, moduleName, runtimeManifest, packagingSnapshot }) {
  const policy = supportedModule(moduleName);
  const widget = policy.kind === 'widget';
  const prefix = `mother/modules/${moduleName}/`;
  // Reuse the runtime integrity boundary: mutable database credentials and
  // placeholder data are installation state, never release package contents.
  const managedFiles = packagingSnapshot?.files || collectManagedFiles(rootDir);
  const backendFiles = managedFiles.filter(record => record.path.startsWith(prefix))
    .map(record => ({ path: record.path.slice(prefix.length), size: record.size, sha256: record.sha256 }));
  if (JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version !== runtimeManifest.version) {
    throw packageError('CORE_MODULE_RELEASE_IDENTITY_MISMATCH');
  }
  const manifest = {
    schemaVersion: 1, product: 'blogpostercms-core-module', moduleName,
    version: runtimeManifest.version, source: runtimeManifest.source,
    hostFingerprint: packagingSnapshot?.hostFingerprint || fingerprintRoot(rootDir, runtimeManifest.files),
    files: [...(widget ? [] : backendFiles),
      ...browserRecords(moduleName, managedFiles)].sort((a, b) => a.path.localeCompare(b.path)),
    ...(widget
      ? readModuleReleaseNotes(path.dirname(path.join(rootDir, policy.entry)), runtimeManifest.version, path.basename(policy.entry).replace(/\.js$/, '.CHANGELOG.md'))
      : readModuleReleaseNotes(path.join(rootDir, 'mother/modules', moduleName), runtimeManifest.version))
  };
  // Release packaging must describe the exact bytes already covered by CI's
  // baseline, not source edits made after that baseline was generated.
  const expected = runtimeManifest.files.filter(record => record.path.startsWith(prefix))
    .map(record => ({ path: record.path.slice(prefix.length), size: record.size, sha256: record.sha256 }));
  expected.push(...browserRecords(moduleName, runtimeManifest.files));
  expected.sort((a, b) => a.path.localeCompare(b.path));
  if (JSON.stringify(expected) !== JSON.stringify(manifest.files)) throw packageError('CORE_MODULE_RELEASE_BYTES_CHANGED');
  return parseManifest(JSON.stringify(manifest), moduleName);
}

function verifyModuleGeneration({ rootDir, generationDir, moduleName, attestationVerifier = verifyAttestation }) {
  if (fs.lstatSync(generationDir).isSymbolicLink() ||
      fs.readdirSync(generationDir).sort().join(',') !== 'code,manifest.bundle.json,manifest.json') throw packageError('CORE_MODULE_PACKAGE_LAYOUT_INVALID');
  for (const filename of ['manifest.json', 'manifest.bundle.json']) {
    const stat = fs.lstatSync(path.join(generationDir, filename));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw packageError('CORE_MODULE_PACKAGE_LAYOUT_INVALID');
  }
  const manifestPath = path.join(generationDir, 'manifest.json');
  const manifest = parseManifest(fs.readFileSync(manifestPath), moduleName);
  // Trust roots are exclusively those shipped by the already verified host.
  const trustedRootPath = path.join(rootDir, '.integrity/runtime-integrity-trusted-root.jsonl');
  if (!fs.existsSync(trustedRootPath)) throw packageError('CORE_MODULE_TRUST_ROOT_MISSING');
  attestationVerifier({ manifestPath, bundlePath: path.join(generationDir, 'manifest.bundle.json'), trustedRootPath,
    expectedVersion: manifest.version, expectedSourceCommit: manifest.source.commit });
  const actual = moduleFiles(path.join(generationDir, 'code'));
  const expected = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw packageError('CORE_MODULE_PACKAGE_INTEGRITY_FAILED');
  if (MODULE_POLICY[moduleName].kind !== 'widget') {
    const info = JSON.parse(fs.readFileSync(path.join(generationDir, 'code/moduleInfo.json'), 'utf8'));
    if (info.moduleName !== moduleName) throw packageError('CORE_MODULE_IDENTITY_MISMATCH');
  }
  // Checking live host bytes also catches changes since initial startup. This
  // intentionally fails on source/dev installations whose dependency tree differs.
  const currentHost = fingerprintRoot(rootDir, collectManagedFiles(rootDir));
  if (currentHost !== manifest.hostFingerprint) throw packageError('CORE_MODULE_HOST_INCOMPATIBLE');
  return { manifest, generationId: hash(fs.readFileSync(manifestPath)), moduleDir: path.join(generationDir, 'code') };
}

module.exports = { MODULE_POLICY, isHostFile, packageError, hostFingerprint, fingerprintRoot, parseManifest, moduleFiles, createModuleManifest, verifyModuleGeneration };
