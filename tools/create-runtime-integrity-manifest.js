'use strict';

const fs = require('fs');
const path = require('path');
const {
  buildRuntimeIntegrityManifest
} = require('../mother/security/runtimeIntegrity');

function createManifestFile({ rootDir, outputPath, env = process.env, now = new Date() }) {
  const packageInfo = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const manifest = buildRuntimeIntegrityManifest({
    rootDir,
    version: packageInfo.version,
    sourceCommit: env.GITHUB_SHA,
    releaseTag: env.GITHUB_REF_NAME,
    generatedAt: now
  });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return manifest;
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const outputPath = path.resolve(process.argv[2] || path.join(rootDir, 'runtime-integrity-manifest.json'));
  const manifest = createManifestFile({ rootDir, outputPath });
  console.log(`[RUNTIME_INTEGRITY_MANIFEST_CREATED] ${outputPath} (${manifest.files.length} files)`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message || String(err));
    process.exit(1);
  }
}

module.exports = {
  createManifestFile
};
