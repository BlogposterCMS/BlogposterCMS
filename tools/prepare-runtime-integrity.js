'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  defaultArtifactUrls,
  fetchHttpsFile,
  parseRuntimeIntegrityManifest,
  verifyAttestation
} = require('../mother/security/runtimeIntegrity');

const ASSETS = [
  'runtime-integrity-manifest.json',
  'runtime-integrity-manifest.bundle.json',
  'runtime-integrity-trusted-root.jsonl'
];

function fail(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

async function prepareRuntimeIntegrity({
  rootDir,
  fetchFile = fetchHttpsFile,
  verify = verifyAttestation,
  runner = spawnSync
}) {
  const version = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version;
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
    fail('RUNTIME_INTEGRITY_BUILD_VERSION_INVALID', 'A stable packaged release version is required.');
  }
  const destination = path.join(rootDir, '.release-integrity');
  const present = ASSETS.map(name => fs.existsSync(path.join(destination, name)));
  if (present.some(Boolean) && !present.every(Boolean)) {
    fail('RUNTIME_INTEGRITY_BUILD_INPUTS_PARTIAL', 'Supply all signed inputs together or none.');
  }

  // CI supplies its complete externally signed inputs. Source builders fetch
  // only release metadata; public trust roots come from gh's own TUF policy,
  // never from an unsigned file downloaded beside an untrusted manifest.
  const supplied = present.every(Boolean);
  const staging = supplied ? destination : fs.mkdtempSync(path.join(rootDir, '.integrity-build-'));
  try {
    if (!supplied) {
      const urls = defaultArtifactUrls(version);
      await fetchFile(urls.manifestUrl, path.join(staging, ASSETS[0]), { maxBytes: 16 * 1024 * 1024 });
      await fetchFile(urls.bundleUrl, path.join(staging, ASSETS[1]), { maxBytes: 1024 * 1024 });
      const roots = runner('gh', ['attestation', 'trusted-root'], {
        encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true,
        env: { ...process.env, GH_PROMPT_DISABLED: '1' }
      });
      if (roots.status !== 0 || !roots.stdout?.trim()) {
        fail('RUNTIME_INTEGRITY_BUILD_ROOTS_FAILED', 'Could not obtain verifier-managed public trust roots.');
      }
      fs.writeFileSync(path.join(staging, ASSETS[2]), roots.stdout, { flag: 'wx' });
    }

    const manifestPath = path.join(staging, ASSETS[0]);
    const manifest = parseRuntimeIntegrityManifest(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.version !== version) {
      fail('RUNTIME_INTEGRITY_BUILD_VERSION_MISMATCH', 'Signed inputs do not match the packaged version.');
    }
    verify({
      manifestPath,
      bundlePath: path.join(staging, ASSETS[1]),
      trustedRootPath: path.join(staging, ASSETS[2]),
      expectedVersion: version,
      expectedSourceCommit: manifest.source.commit
    });
    if (!supplied) {
      fs.mkdirSync(destination, { recursive: true });
      for (const name of ASSETS) fs.renameSync(path.join(staging, name), path.join(destination, name));
    }
    return { version, sourceCommit: manifest.source.commit, downloaded: !supplied };
  } finally {
    // Only remove the temporary directory created by this invocation.
    if (!supplied) fs.rmSync(staging, { recursive: true, force: true });
  }
}

if (require.main === module) {
  prepareRuntimeIntegrity({ rootDir: path.resolve(__dirname, '..') }).then(result => {
    console.log(`[RUNTIME_INTEGRITY_BUILD_INPUTS_VERIFIED] ${result.version} ${result.sourceCommit}`);
  }).catch(error => {
    console.error(error.message || String(error));
    process.exit(1);
  });
}

module.exports = { prepareRuntimeIntegrity };
