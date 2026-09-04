'use strict';

const fs = require('fs');
const path = require('path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

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
  expect(dockerfile).toContain('VOLUME ["/app/data", "/app/library"]');
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
