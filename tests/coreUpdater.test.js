const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  buildManifest
} = require('../tools/create-core-update-manifest');

const rootDir = path.resolve(__dirname, '..');
const updaterPath = path.join(rootDir, 'deploy', 'blogposter-update');

test.each([
  ['success', 0, ''],
  ['download-failure', 1, 'CORE_UPDATE_IMAGE_BUNDLE_DOWNLOAD_FAILED'],
  ['invalid-proof', 1, 'CORE_UPDATE_ATTESTATION_INVALID']
])('anonymous image proof verification fails closed: %s', (scenario, status, errorCode) => {
  // Exercise the real shell boundary with no credential environment. Only the
  // external transport/verifier are substituted; their policy arguments remain
  // mandatory and a failed download must never reach the verifier.
  const script = [
    'source deploy/blogposter-update',
    'unset GH_TOKEN GITHUB_TOKEN',
    `scenario='${scenario}'`,
    'timeout() { shift 2; "$@"; }',
    'curl() {',
    '  [[ "$*" == *"--connect-timeout 15"* && "$*" == *"--max-time 45"* && "$*" == *"--max-filesize 2097152"* ]] || return 90',
    '  [[ "$*" == *"--retry 3"* && "$*" == *"--retry-max-time 120"* && "$*" == *"--retry-all-errors"* ]] || return 90',
    '  [[ "${!#}" == "https://github.com/BlogposterCMS/BlogposterCMS/releases/download/v0.10.1/blogposter-image.bundle.json" ]] || return 91',
    '  [[ "$scenario" != download-failure ]] || return 22',
    '}',
    'gh() {',
    '  [[ "$scenario" != download-failure ]] || { echo UNEXPECTED_VERIFIER >&2; return 92; }',
    '  [[ -z "${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]] || return 93',
    '  [[ "$*" == *"--bundle "* && "$*" == *"--repo BlogposterCMS/BlogposterCMS"* ]] || return 94',
    '  [[ "$*" == *"--signer-workflow BlogposterCMS/BlogposterCMS/.github/workflows/release.yml"* ]] || return 95',
    '  [[ "$*" == *"--source-ref refs/tags/v0.10.1"* && "$*" == *"--source-digest trusted-commit"* && "$*" == *"--deny-self-hosted-runners"* ]] || return 96',
    // GitHub CLI selects the bundle parser by extension, even for valid bytes.
    '  while (($#)); do if [[ "$1" == --bundle ]]; then [[ "$2" == *.json && -f "$2" ]] || return 97; break; fi; shift; done',
    '  [[ "$scenario" != invalid-proof ]] || return 1',
    '}',
    `verify_image_trust 'ghcr.io/blogpostercms/blogpostercms@sha256:${'a'.repeat(64)}' BlogposterCMS/BlogposterCMS 0.10.1 trusted-commit`
  ].join('\n');
  const result = spawnSync('bash', ['-s'], { cwd: rootDir, encoding: 'utf8', input: script });
  expect(result.status).toBe(status);
  expect(result.stderr).toContain(errorCode);
  expect(result.stderr).not.toContain('UNEXPECTED_VERIFIER');
});

test.each([
  ['transient', 0, 2],
  ['network', 75, 3],
  ['timeout', 75, 3],
  ['invalid', 1, 1]
])('bounded verifier retries classify %s without weakening proof checks', (scenario, status, calls) => {
  const result = spawnSync('bash', ['-s'], { cwd: rootDir, encoding: 'utf8', input: [
    'source deploy/blogposter-update',
    'calls=0',
    'sleep() { :; }',
    'timeout() { [[ "$1" == --kill-after=5s && "$2" == 60s ]] || return 99; shift 2; "$@"; }',
    'gh() {',
    '  calls=$((calls+1))',
    `  if [[ '${scenario}' == transient && "$calls" == 2 ]]; then return 0; fi`,
    `  if [[ '${scenario}' == invalid ]]; then echo 'signature identity mismatch' >&2; return 1; fi`,
    `  if [[ '${scenario}' == timeout ]]; then return 124; fi`,
    "  echo 'dial tcp: i/o timeout https://provider.invalid/private-url' >&2; return 1",
    '}',
    'if verify_release_attestation fixture --repo BlogposterCMS/BlogposterCMS; then result=0; else result=$?; fi',
    'echo "calls=$calls"',
    'exit "$result"'
  ].join('\n') });
  expect(result.status).toBe(status);
  expect(result.stdout).toContain(`calls=${calls}`);
  expect(result.stderr).not.toContain('provider.invalid');
});

test('stable promotion is newer than the same-version preview without allowing downgrades', () => {
  const result = spawnSync('bash', ['-s'], { cwd: rootDir, encoding: 'utf8', input: [
    'source deploy/blogposter-update',
    'semver_greater 0.10.0 0.10.0-rc.2 || exit 21',
    'if semver_greater 0.9.5 0.10.0-rc.2; then exit 22; fi',
    'if semver_greater 0.10.0 0.10.0; then exit 23; fi',
    'if semver_greater 0.10.0-rc.2 0.10.0; then exit 24; fi'
  ].join('\n') });
  expect(result.status).toBe(0);
});

test('reviewed release drift is rejected before Docker or data changes', () => {
  const command = [
    'source deploy/blogposter-update',
    'fetch_manifest() { :; }',
    'manifest_value() { case "$1" in .version) echo 0.9.5;; .minimumUpdaterVersion) echo 1.0.0;; .source.repository) echo BlogposterCMS/BlogposterCMS;; .source.commit) echo unused;; esac; }',
    `select_image_reference() { echo ghcr.io/blogpostercms/blogpostercms@sha256:${'a'.repeat(64)}; }`,
    'docker() { echo UNEXPECTED_DOCKER_CALL; exit 88; }',
    'MANIFEST_FILE=unused', 'MANIFEST_BUNDLE_FILE=unused',
    'BLOGPOSTER_UPDATE_REPOSITORY=BlogposterCMS/BlogposterCMS',
    'EXPECTED_VERSION=0.9.6', `EXPECTED_IMAGE=ghcr.io/blogpostercms/blogpostercms@sha256:${'a'.repeat(64)}`,
    'run_apply'
  ].join('\n');
  // Send code on stdin so Windows/WSL argument quoting cannot expand $1.
  const result = spawnSync('bash', ['-s'], { input: command, cwd: rootDir, encoding: 'utf8' });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('CORE_UPDATE_TARGET_CHANGED');
  expect(result.stdout).not.toContain('UNEXPECTED_DOCKER_CALL');
});

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
  expect(source).toContain('CORE_UPDATE_MANIFEST_ATTESTATION_INVALID');
  expect(source).toContain('--signer-workflow "$TRUSTED_SIGNER_WORKFLOW"');
  expect(source).toContain('--source-ref "refs/tags/v${candidate_version}"');
  expect(source).toContain('--source-digest "$candidate_commit"');
  expect(source).toContain('verify_release_attestation "oci://$image_ref"');
  expect(source).toContain('timeout --kill-after=5s 60s gh attestation verify "$@"');
  expect(source).toContain('CORE_UPDATE_CURRENT_IMAGE_MUTABLE');
  expect(source).toContain('create_volume_backups');
  expect(source).toContain('migrate_notification_state');
  expect(source).toContain('CORE_UPDATE_NOTIFICATION_STATE_MIGRATION_FAILED');
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

test('host updater seeds legacy notification state only inside the canonical data volume', () => {
  const source = fs.readFileSync(updaterPath, 'utf8');
  expect(source).toContain('migrate_notification_state "$id"');
  expect(source).toContain('/app/data/notificationManager/integrationsRegistry.json');
  expect(source).toContain('[ -e "$target" ] && exit 0');
  expect(source).toContain('CORE_UPDATE_NOTIFICATION_STATE_MIGRATION_FAILED');
});

test('release workflow publishes and attests the full server image and updater assets', () => {
  const workflow = fs.readFileSync(path.join(rootDir, '.github', 'workflows', 'release.yml'), 'utf8');
  expect(workflow).toContain('docker/build-push-action@v6');
  expect(workflow).toContain('actions/attest@v4');
  expect(workflow).toContain('artifact-metadata: write');
  expect(workflow).toContain('blogposter-update.json');
  expect(workflow).toContain('blogposter-update.bundle.json');
  expect(workflow).toContain('id: image_attestation');
  expect(workflow).toContain('cp "${{ steps.image_attestation.outputs.bundle-path }}" release-assets/blogposter-image.bundle.json');
  expect(workflow).toContain('Verify public image provenance without saved credentials');
  expect(workflow).toContain('unset GH_TOKEN GITHUB_TOKEN GH_ENTERPRISE_TOKEN GITHUB_ENTERPRISE_TOKEN');
  expect(workflow).toContain('export DOCKER_CONFIG="$(mktemp -d)"');
  expect(workflow).toContain('source deploy/blogposter-update');
  expect(workflow).toContain('verify_image_trust "$RELEASE_IMAGE" "$GITHUB_REPOSITORY" "${GITHUB_REF_NAME#v}" "$GITHUB_SHA"');
  expect(workflow).toContain('CORE_UPDATE_WRONG_SOURCE_ACCEPTED');
  expect(workflow).toContain('runtime-integrity-manifest.json');
  expect(workflow).toContain('runtime-integrity-manifest.bundle.json');
  expect(workflow).toContain('Download signed runtime integrity assets');
  expect(workflow).toContain('blogposter-update');
  expect(workflow).toContain('CORE_UPDATE_RELEASE_TAG_MISMATCH');
});

test('production image pins the shared GitHub attestation verifier', () => {
  const dockerfile = fs.readFileSync(path.join(rootDir, 'Dockerfile'), 'utf8');
  expect(dockerfile).toContain('ARG GH_VERSION=2.96.0');
  expect(dockerfile).toContain('sha256sum -c -');
  expect(dockerfile).toContain('COPY --from=github-cli /usr/local/bin/gh /usr/local/bin/gh');
  expect(dockerfile).toContain('COPY .release-integrity/runtime-integrity-manifest.json /app/.integrity/');
  expect(dockerfile).toContain('verify-runtime-integrity-baseline.js');
  expect(dockerfile).not.toContain('COPY --from=build --chown=node:node /app /app');
  expect(dockerfile).toContain('BLOGPOSTER_RUNTIME_INTEGRITY=required');
  expect(dockerfile).not.toMatch(/PRIVATE_KEY|SIGNING_KEY/);
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
