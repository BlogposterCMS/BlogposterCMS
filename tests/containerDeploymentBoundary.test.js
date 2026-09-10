'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('ACR source trigger follows publication of signed release assets', () => {
  const release = read('.github/workflows/release.yml');
  const publication = release.indexOf('- name: Create GitHub Release');
  const trigger = release.indexOf('- name: Signal source builders after signed release assets are published');
  expect(publication).toBeGreaterThan(0);
  expect(trigger).toBeGreaterThan(publication);
  expect(release.slice(trigger)).toContain('REF="tags/acr-${GITHUB_REF_NAME}"');
  expect(release.slice(trigger)).toContain('ACR_SOURCE_TAG_CONFLICT');
});

test.each([
  ['missing', 0, true],
  ['same', 0, false],
  ['conflict', 1, false],
  ['lookup-failure', 7, false]
])('ACR promotion shell handles %s without moving an existing tag', (scenario, status, createsTag) => {
  // Execute the actual final workflow shell block. Only gh transport is replaced.
  const step = read('.github/workflows/release.yml').split('      - name: Signal source builders after signed release assets are published')[1];
  const script = step.split('        run: |')[1].split(/\r?\n/).map(line => line.replace(/^          /, '')).join('\n');
  const fixture = [
    'set -e',
    'GITHUB_REF_NAME=v0.10.28 GITHUB_REPOSITORY=BlogposterCMS/BlogposterCMS GITHUB_SHA=expected-commit',
    'gh() {',
    '  if [[ "$2" == --method ]]; then',
    '    [[ "$*" == *"ref=refs/tags/acr-v0.10.28"* && "$*" == *"sha=expected-commit"* ]] || return 98',
    '    echo ACR_TAG_CREATED >&2; return 0',
    '  fi',
    // Reproduce gh's non-empty stdout on an unsuccessful exact-ref lookup.
    '  [[ "$2" == */git/matching-refs/tags/acr-v0.10.28 ]] || { echo \'{"message":"Not Found"}\'; return 1; }',
    `  case '${scenario}' in`,
    '    missing) return 0 ;;',
    '    same) echo expected-commit ;;',
    '    conflict) echo different-commit ;;',
    '    lookup-failure) echo \'{"message":"Unavailable"}\'; return 7 ;;',
    '  esac',
    '}',
    script
  ].join('\n');
  const result = spawnSync('bash', ['-s'], { input: fixture, encoding: 'utf8' });
  expect(result.status).toBe(status);
  expect(result.stderr.includes('ACR_TAG_CREATED')).toBe(createsTag);
  expect(result.stdout.includes('ACR_SOURCE_TAG_CONFLICT')).toBe(scenario === 'conflict');
});

test('container keeps runtime, native modules and non-root persistent state together', () => {
  const dockerfile = read('Dockerfile');
  expect(dockerfile.match(/^FROM \$\{NODE_IMAGE\} AS (build|runtime)$/gm)).toHaveLength(2);
  expect(dockerfile).not.toContain('FROM node:24-bookworm');
  expect(dockerfile).toContain('npm ci --no-audit');
  expect(dockerfile).not.toContain('RUN npm audit');
  expect(dockerfile).toContain('npm run build');
  expect(dockerfile).toContain('npm prune --omit=dev');
  expect(dockerfile).toContain('verify-runtime-integrity-baseline.js');
  expect(dockerfile).toContain('USER node');
  expect(dockerfile).toContain('VOLUME ["/app/data", "/app/library", "/app/modules", "/app/widgets"]');
  for (const name of ['install.lock', 'modulePasswords.json', 'placeholderData.json']) {
    expect(dockerfile).toContain(`ln -s /app/data/${name} /app/`);
    expect(read('.dockerignore')).not.toContain(`!${name}`);
  }
  expect(dockerfile).toContain('DEV_AUTOLOGIN=false DEV_AGENT_LOGIN=false');
  expect(dockerfile).toContain("http://127.0.0.1:3000/health/ready");
  expect(dockerfile).toContain("j.code==='BLOGPOSTER_READY'");
  expect(dockerfile).toContain('CMD ["node", "app.js"]');
});

test('GitHub workflows retain the authoritative full-tree vulnerability gate', () => {
  for (const workflow of ['.github/workflows/ci.yml', '.github/workflows/release.yml']) {
    expect(read(workflow)).toContain('npm audit --audit-level=high');
  }
});

test('one digest-pinned Trixie base supports a reviewed build-time registry override', () => {
  const dockerfile = read('Dockerfile');
  const base = dockerfile.match(/^ARG NODE_IMAGE=(.+)$/m);
  expect(base).not.toBeNull();
  expect(base[1]).toMatch(/^docker\.io\/library\/node:24-trixie-slim@sha256:[a-f0-9]{64}$/);
  // A global ARG must precede the first FROM to apply to both independent stages.
  expect(dockerfile.indexOf(base[0])).toBeLessThan(dockerfile.indexOf('FROM ${NODE_IMAGE}'));
  expect(dockerfile.match(/^ARG NODE_IMAGE=/gm)).toHaveLength(1);
  expect(dockerfile).not.toMatch(/^FROM (?:node:|docker\.io\/)/m);
});

test('build context excludes local secrets and site state by default', () => {
  const rules = read('.dockerignore').split(/\r?\n/).filter(line => line && !line.startsWith('#'));
  expect(rules[0]).toBe('**');
  for (const prefix of ['data', 'library', 'logs', 'overrides', '.git', '.agent-worklog']) {
    expect(rules.some(rule => rule.startsWith(`!${prefix}`))).toBe(false);
  }
  for (const rule of ['**/.env', '**/.env.*', '**/*.secrets.js', '**/*.local.js',
    '**/modulePasswords.json', '**/placeholderData.json', '**/*.sqlite*', '**/*.pem']) {
    expect(rules).toContain(rule);
  }
});

test('release images require packaged trust roots and pass offline verification', () => {
  const rootAsset = 'runtime-integrity-trusted-root.jsonl';
  expect(read('Dockerfile')).toContain('FROM build AS integrity-inputs');
  // Node embeds its own roots, but gh uses the OS trust store during source builds.
  const inputStage = read('Dockerfile').split('FROM build AS integrity-inputs')[1].split('FROM integrity-inputs AS verified-build')[0];
  expect(inputStage).toContain('COPY --from=github-cli /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt');
  expect(read('Dockerfile')).toContain('RUN node tools/prepare-runtime-integrity.js');
  expect(read('Dockerfile')).toContain('FROM integrity-inputs AS verified-build');
  expect(read('Dockerfile')).toContain('COPY --from=verified-build /app /app');
  expect(read('Dockerfile')).toContain(`COPY --from=integrity-inputs /app/.release-integrity/${rootAsset} /app/.integrity/${rootAsset}`);
  expect(read('.dockerignore')).toContain(`!.release-integrity/${rootAsset}`);
  const release = read('.github/workflows/release.yml');
  expect(release).toContain(`gh attestation trusted-root > ${rootAsset}`);
  expect(release).toContain('docker run --rm --network none --entrypoint node');
  expect(release).toContain('CONTAINER_OFFLINE_INTEGRITY_OK');
  expect(read('.github/workflows/ci.yml')).toContain('--target build');
});
