'use strict';

const fs = require('fs');
const path = require('path');
const { MODULE_POLICY, createModuleManifest, fingerprintRoot } = require('../mother/modules/updater/coreModulePackages');
const { collectManagedFiles } = require('../mother/security/runtimeIntegrity');
const { buildModuleArchive } = require('../mother/modules/updater/coreModuleArchive');

function prepare({ rootDir, outputDir, runtimeManifest }) {
  fs.mkdirSync(outputDir, { recursive: true });
  // Release inputs are fixed for this run. Hash the host tree once for the whole
  // catalog; archive creation still rechecks the bytes of each packaged file.
  const packagingSnapshot = { files: collectManagedFiles(rootDir),
    hostFingerprint: fingerprintRoot(rootDir, runtimeManifest.files) };
  for (const moduleName of Object.keys(MODULE_POLICY)) {
    const manifest = createModuleManifest({ rootDir, moduleName, runtimeManifest, packagingSnapshot });
    fs.writeFileSync(path.join(outputDir, `core-module-${moduleName}.json`), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  }
}

function pack({ rootDir, outputDir, bundlePath }) {
  const bundle = fs.readFileSync(bundlePath);
  for (const moduleName of Object.keys(MODULE_POLICY)) {
    const manifest = fs.readFileSync(path.join(outputDir, `core-module-${moduleName}.json`));
    const archive = buildModuleArchive({ rootDir, moduleName, moduleDir: path.join(rootDir, 'mother/modules', moduleName), manifest, bundle });
    fs.writeFileSync(path.join(outputDir, `core-module-${moduleName}.zip`), archive, { flag: 'wx' });
  }
}

if (require.main === module) {
  try {
    const [action, destination, input] = process.argv.slice(2);
    if (!['prepare', 'pack'].includes(action) || !destination || !input) throw new Error('CORE_MODULE_PACKAGER_ARGUMENTS_INVALID');
    const rootDir = path.resolve(__dirname, '..');
    const outputDir = path.resolve(destination);
    if (action === 'prepare') prepare({ rootDir, outputDir, runtimeManifest: JSON.parse(fs.readFileSync(input, 'utf8')) });
    else pack({ rootDir, outputDir, bundlePath: path.resolve(input) });
  } catch (error) {
    console.error(error.code || error.message);
    process.exitCode = 1;
  }
}

module.exports = { prepare, pack };
