'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { MANAGED_PATHS, collectManagedFiles, TRUSTED_REPOSITORY } = require('../../mother/security/runtimeIntegrity');
const { createModuleManifest, verifyModuleGeneration } = require('../../mother/modules/updater/coreModulePackages');

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-module-package-'));
  const rootDir = path.join(directory, 'host');
  fs.mkdirSync(rootDir);
  for (const entry of MANAGED_PATHS) {
    if (entry.includes('.')) fs.writeFileSync(path.join(rootDir, entry), '{}');
    else fs.mkdirSync(path.join(rootDir, entry));
  }
  fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ name: 'blogposter_cms', version: '0.10.6', engines: { node: '>=24' } }));
  const moduleRoot = path.join(rootDir, 'mother/modules/translationManager');
  fs.mkdirSync(moduleRoot, { recursive: true });
  fs.writeFileSync(path.join(moduleRoot, 'index.js'), 'module.exports = { version: 1 };');
  fs.writeFileSync(path.join(moduleRoot, 'dbInit.js'), 'module.exports = {};');
  fs.writeFileSync(path.join(moduleRoot, 'moduleInfo.json'), JSON.stringify({ moduleName: 'translationManager', version: '0.5.0' }));
  fs.mkdirSync(path.join(rootDir, '.integrity'));
  fs.writeFileSync(path.join(rootDir, '.integrity/runtime-integrity-trusted-root.jsonl'), 'test roots');
  const source = path.join(directory, 'candidate');
  fs.cpSync(rootDir, source, { recursive: true });
  const packageInfo = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({ ...packageInfo, version: '0.10.7' }));
  fs.writeFileSync(path.join(source, 'mother/modules/translationManager/index.js'), 'module.exports = { version: 2 };');
  const runtimeManifest = { version: '0.10.7', source: { repository: TRUSTED_REPOSITORY, commit: 'a'.repeat(40), tag: 'v0.10.7' }, files: collectManagedFiles(source) };
  const manifest = createModuleManifest({ rootDir: source, moduleName: 'translationManager', runtimeManifest });
  const generationDir = path.join(directory, 'generation');
  fs.mkdirSync(generationDir);
  fs.cpSync(path.join(source, 'mother/modules/translationManager'), path.join(generationDir, 'code'), { recursive: true });
  fs.writeFileSync(path.join(generationDir, 'manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(generationDir, 'manifest.bundle.json'), '{}');
  const attestationVerifier = jest.fn();
  const verify = options => verifyModuleGeneration({ ...options, attestationVerifier });
  return { directory, rootDir, generationDir, manifest, source, runtimeManifest, attestationVerifier, verify };
}

module.exports = { createFixture };
