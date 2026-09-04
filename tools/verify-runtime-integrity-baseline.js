'use strict';

const fs = require('fs');
const path = require('path');
const {
  collectManagedFiles,
  compareRecords,
  parseRuntimeIntegrityManifest
} = require('../mother/security/runtimeIntegrity');

function verifyBuildBaseline({ rootDir, manifestPath }) {
  const manifest = parseRuntimeIntegrityManifest(fs.readFileSync(manifestPath, 'utf8'));
  const issues = compareRecords(manifest.files, collectManagedFiles(rootDir));
  if (issues.length) {
    const err = new Error(
      `[RUNTIME_INTEGRITY_BUILD_BASELINE_MISMATCH] ${issues[0].code}: ${issues[0].path}`
    );
    err.code = 'RUNTIME_INTEGRITY_BUILD_BASELINE_MISMATCH';
    err.issues = issues;
    throw err;
  }
  return { fileCount: manifest.files.length, version: manifest.version };
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const manifestPath = path.resolve(process.argv[2] || '');
  if (!process.argv[2]) {
    throw new Error('[RUNTIME_INTEGRITY_BUILD_MANIFEST_REQUIRED] Pass the signed manifest path.');
  }
  const result = verifyBuildBaseline({ rootDir, manifestPath });
  console.log(`[RUNTIME_INTEGRITY_BUILD_VERIFIED] ${result.version} (${result.fileCount} files)`);
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
  verifyBuildBaseline
};
