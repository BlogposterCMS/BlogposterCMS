'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { collectManagedFiles, verifyAttestation, TRUSTED_REPOSITORY } = require('../../security/runtimeIntegrity');

// Host-owned policy: package metadata cannot opt another module into hot loading.
// Schema/bootstrap helpers stay in the host compatibility fingerprint.
const MODULE_POLICY = Object.freeze({
  translationManager: Object.freeze({ hostFiles: ['dbInit.js'] }),
  contentEngine: Object.freeze({ hostFiles: ['contentService.js'] }),
  searchManager: Object.freeze({ hostFiles: ['searchService.js'] }),
  workflowManager: Object.freeze({ hostFiles: ['workflowService.js'] }),
  exportManager: Object.freeze({ hostFiles: [] })
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
  return Object.entries(MODULE_POLICY).some(([name, policy]) => {
    const prefix = `mother/modules/${name}/`;
    return filename.startsWith(prefix) && !policy.hostFiles.includes(filename.slice(prefix.length));
  });
}

/** Version-only package changes do not invalidate a host; dependency changes do. */
function hostFingerprint(files, packageInfo, lockfiles = {}) {
  const normalizedPackage = { ...packageInfo };
  delete normalizedPackage.version;
  const records = files.filter(record => record.path !== 'package.json' && !Object.prototype.hasOwnProperty.call(lockfiles, record.path) && !hotFile(record.path))
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
  supportedModule(moduleName);
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
  let size = 0;
  for (const record of manifest.files) {
    const filename = record?.path;
    if (typeof filename !== 'string' || !/^[A-Za-z0-9_.\/-]+$/.test(filename) ||
        filename.split('/').some(part => !part || part === '.' || part === '..' || part.endsWith('.')) ||
        path.isAbsolute(filename) || seen.has(filename.toLowerCase()) ||
        !HASH.test(record.sha256 || '') || !Number.isSafeInteger(record.size) || record.size < 0) {
      throw packageError('CORE_MODULE_MANIFEST_FILE_INVALID');
    }
    seen.add(filename.toLowerCase()); size += record.size;
  }
  if (size > MAX_BYTES || !manifest.files.some(record => record.path === 'index.js') ||
      !manifest.files.some(record => record.path === 'moduleInfo.json')) throw packageError('CORE_MODULE_MANIFEST_FILE_INVALID');
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

function createModuleManifest({ rootDir, moduleName, runtimeManifest }) {
  supportedModule(moduleName);
  if (JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version !== runtimeManifest.version) {
    throw packageError('CORE_MODULE_RELEASE_IDENTITY_MISMATCH');
  }
  const manifest = {
    schemaVersion: 1, product: 'blogpostercms-core-module', moduleName,
    version: runtimeManifest.version, source: runtimeManifest.source,
    hostFingerprint: fingerprintRoot(rootDir, runtimeManifest.files),
    files: moduleFiles(path.join(rootDir, 'mother/modules', moduleName))
  };
  // Release packaging must describe the exact bytes already covered by CI's
  // baseline, not source edits made after that baseline was generated.
  const prefix = `mother/modules/${moduleName}/`;
  const expected = runtimeManifest.files.filter(record => record.path.startsWith(prefix))
    .map(record => ({ path: record.path.slice(prefix.length), size: record.size, sha256: record.sha256 }));
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
  const info = JSON.parse(fs.readFileSync(path.join(generationDir, 'code/moduleInfo.json'), 'utf8'));
  if (info.moduleName !== moduleName) throw packageError('CORE_MODULE_IDENTITY_MISMATCH');
  // Checking live host bytes also catches changes since initial startup. This
  // intentionally fails on source/dev installations whose dependency tree differs.
  const currentHost = fingerprintRoot(rootDir, collectManagedFiles(rootDir));
  if (currentHost !== manifest.hostFingerprint) throw packageError('CORE_MODULE_HOST_INCOMPATIBLE');
  return { manifest, generationId: hash(fs.readFileSync(manifestPath)), moduleDir: path.join(generationDir, 'code') };
}

module.exports = { MODULE_POLICY, packageError, hostFingerprint, parseManifest, moduleFiles, createModuleManifest, verifyModuleGeneration };
