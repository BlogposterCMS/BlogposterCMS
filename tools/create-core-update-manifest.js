'use strict';

const fs = require('fs');
const path = require('path');

function fail(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  throw err;
}

function readJson(filePath, code) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    fail(code, `Cannot read ${filePath}: ${err.message}`);
  }
}

function requireSemver(value, label) {
  const normalized = String(value || '').trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(normalized)) {
    fail('CORE_UPDATE_MANIFEST_VERSION_INVALID', `${label} must be a semantic version.`);
  }
  return normalized;
}

function buildManifest({ packageInfo, policy, env = process.env, now = new Date() }) {
  const version = requireSemver(packageInfo?.version, 'package version');
  const tag = String(env.GITHUB_REF_NAME || `v${version}`).trim();
  if (tag !== `v${version}`) {
    fail('CORE_UPDATE_MANIFEST_TAG_MISMATCH', `Release tag "${tag}" must match package version "v${version}".`);
  }

  const repository = String(env.GITHUB_REPOSITORY || 'BlogposterCMS/BlogposterCMS').trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    fail('CORE_UPDATE_MANIFEST_REPOSITORY_INVALID', 'GITHUB_REPOSITORY is invalid.');
  }
  const sourceCommit = String(env.GITHUB_SHA || '').trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) {
    fail('CORE_UPDATE_MANIFEST_COMMIT_INVALID', 'GITHUB_SHA must be a full Git commit SHA.');
  }
  const imageRepository = String(env.BLOGPOSTER_IMAGE_REPOSITORY || '').trim().toLowerCase();
  if (!/^[a-z0-9.-]+\/[a-z0-9._/-]+$/.test(imageRepository)) {
    fail('CORE_UPDATE_MANIFEST_IMAGE_INVALID', 'BLOGPOSTER_IMAGE_REPOSITORY is invalid.');
  }
  const imageDigest = String(env.BLOGPOSTER_IMAGE_DIGEST || '').trim().toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(imageDigest)) {
    fail('CORE_UPDATE_MANIFEST_DIGEST_INVALID', 'BLOGPOSTER_IMAGE_DIGEST must be an sha256 digest.');
  }
  if (policy?.schemaVersion !== 1 || policy?.database?.rollbackCompatible !== true) {
    fail(
      'CORE_UPDATE_MANIFEST_ROLLBACK_POLICY_INVALID',
      'Automatic releases require an explicit rollback-compatible database policy.'
    );
  }

  return {
    schemaVersion: 1,
    product: 'blogpostercms',
    version,
    channel: version.includes('-') ? 'prerelease' : 'stable',
    publishedAt: now.toISOString(),
    minimumUpdaterVersion: requireSemver(policy.minimumUpdaterVersion, 'minimum updater version'),
    source: {
      repository,
      commit: sourceCommit,
      tag
    },
    image: {
      repository: imageRepository,
      digest: imageDigest,
      reference: `${imageRepository}@${imageDigest}`
    },
    database: {
      migrationMode: String(policy.database.migrationMode || 'none'),
      rollbackCompatible: true
    }
  };
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const outputPath = path.resolve(process.argv[2] || path.join(rootDir, 'blogposter-update.json'));
  const manifest = buildManifest({
    packageInfo: readJson(path.join(rootDir, 'package.json'), 'CORE_UPDATE_PACKAGE_READ_FAILED'),
    policy: readJson(path.join(rootDir, 'deploy', 'update-policy.json'), 'CORE_UPDATE_POLICY_READ_FAILED')
  });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  console.log(`[CORE_UPDATE_MANIFEST_CREATED] ${outputPath}`);
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
  buildManifest,
  requireSemver
};
