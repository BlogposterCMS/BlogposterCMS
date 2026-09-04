const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  buildManifest
} = require('../tools/create-core-update-manifest');

const rootDir = path.resolve(__dirname, '..');
const updaterPath = path.join(rootDir, 'deploy', 'blogposter-update');

test('core update manifest binds release, source commit and immutable image digest', () => {
  const manifest = buildManifest({
    packageInfo: { version: '1.2.3' },
    policy: {
      schemaVersion: 1,
      minimumUpdaterVersion: '1.0.0',
      database: { migrationMode: 'none', rollbackCompatible: true }
    },
    env: {
      GITHUB_REF_NAME: 'v1.2.3',
      GITHUB_REPOSITORY: 'BlogposterCMS/BlogposterCMS',
      GITHUB_SHA: 'a'.repeat(40),
      BLOGPOSTER_IMAGE_REPOSITORY: 'ghcr.io/blogpostercms/blogpostercms',
      BLOGPOSTER_IMAGE_DIGEST: `sha256:${'b'.repeat(64)}`
    },
    now: new Date('2026-09-04T12:00:00.000Z')
  });

  expect(manifest).toEqual(expect.objectContaining({
    schemaVersion: 1,
    product: 'blogpostercms',
    version: '1.2.3',
    minimumUpdaterVersion: '1.0.0',
    image: {
      repository: 'ghcr.io/blogpostercms/blogpostercms',
      digest: `sha256:${'b'.repeat(64)}`,
      reference: `ghcr.io/blogpostercms/blogpostercms@sha256:${'b'.repeat(64)}`
    }
  }));
  expect(manifest.source.commit).toBe('a'.repeat(40));
  expect(manifest.database.rollbackCompatible).toBe(true);
});

test('core update manifest rejects tag drift and unsafe rollback policy', () => {
  const base = {
    packageInfo: { version: '1.2.3' },
    policy: {
      schemaVersion: 1,
      minimumUpdaterVersion: '1.0.0',
      database: { migrationMode: 'none', rollbackCompatible: true }
    },
    env: {
      GITHUB_REF_NAME: 'v1.2.4',
      GITHUB_REPOSITORY: 'BlogposterCMS/BlogposterCMS',
      GITHUB_SHA: 'a'.repeat(40),
      BLOGPOSTER_IMAGE_REPOSITORY: 'ghcr.io/blogpostercms/blogpostercms',
      BLOGPOSTER_IMAGE_DIGEST: `sha256:${'b'.repeat(64)}`
    }
  };

  expect(() => buildManifest(base)).toThrow(/CORE_UPDATE_MANIFEST_TAG_MISMATCH/);
  expect(() => buildManifest({
    ...base,
    env: { ...base.env, GITHUB_REF_NAME: 'v1.2.3' },
    policy: { ...base.policy, database: { migrationMode: 'destructive', rollbackCompatible: false } }
  })).toThrow(/CORE_UPDATE_MANIFEST_ROLLBACK_POLICY_INVALID/);
});

test('host updater is valid Bash and keeps update safety gates explicit', () => {
  const syntax = spawnSync('bash', ['-n', 'deploy/blogposter-update'], { cwd: rootDir, encoding: 'utf8' });
  expect(syntax.status).toBe(0);
  expect(syntax.stderr).toBe('');

  const source = fs.readFileSync(updaterPath, 'utf8');
  expect(source).toContain("gh attestation verify \"oci://$image_ref\"");
  expect(source).toContain('CORE_UPDATE_CURRENT_IMAGE_MUTABLE');
  expect(source).toContain('create_volume_backups');
  expect(source).toContain('restore_volume_backups');
  expect(source).toContain('CORE_UPDATE_ROLLBACK_CONFIRMATION_REQUIRED');
  expect(source).toContain('verify_running_version');
  expect(source).not.toContain('docker compose down -v');
});

test('host updater semantic version comparison blocks equal and older releases', () => {
  const command = [
    'source deploy/blogposter-update',
    "semver_greater 1.2.4 1.2.3",
    "! semver_greater 1.2.3 1.2.3",
    "! semver_greater 1.2.2 1.2.3"
  ].join('; ');
  const result = spawnSync('bash', ['-lc', command], { cwd: rootDir, encoding: 'utf8' });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
});

test('release workflow publishes and attests the full server image and updater assets', () => {
  const workflow = fs.readFileSync(path.join(rootDir, '.github', 'workflows', 'release.yml'), 'utf8');
  expect(workflow).toContain('docker/build-push-action@v6');
  expect(workflow).toContain('actions/attest@v4');
  expect(workflow).toContain('artifact-metadata: write');
  expect(workflow).toContain('blogposter-update.json');
  expect(workflow).toContain('blogposter-update');
  expect(workflow).toContain('CORE_UPDATE_RELEASE_TAG_MISMATCH');
});

test('official Compose layout keeps mutable state and Git overlays outside the image', () => {
  const compose = fs.readFileSync(path.join(rootDir, 'deploy', 'blogposter.compose.yml'), 'utf8');
  expect(compose).toContain('image: ${BLOGPOSTER_IMAGE:?');
  expect(compose).toContain('blogposter_data:/app/data');
  expect(compose).toContain('blogposter_library:/app/library');
  expect(compose).toContain(':/app/data/module-overrides:ro');
  expect(compose).not.toMatch(/ports:/);
  expect(compose).not.toContain('build:');
});
