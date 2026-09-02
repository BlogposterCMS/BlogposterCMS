'use strict';

const fs = require('fs');
const path = require('path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('container keeps runtime, native modules and non-root persistent state together', () => {
  const dockerfile = read('Dockerfile');
  expect(dockerfile.match(/FROM node:24-bookworm-slim/g)).toHaveLength(2);
  expect(dockerfile).toContain('npm ci && npm audit --audit-level=high');
  expect(dockerfile).toContain('npm run build && npm prune --omit=dev');
  expect(dockerfile).toContain('USER node');
  expect(dockerfile).toContain('VOLUME ["/app/data", "/app/library"]');
  for (const name of ['install.lock', 'modulePasswords.json', 'placeholderData.json']) {
    expect(dockerfile).toContain(`ln -s /app/data/${name} /app/`);
    expect(read('.dockerignore')).not.toContain(`!${name}`);
  }
  expect(dockerfile).toContain('DEV_AUTOLOGIN=false DEV_AGENT_LOGIN=false');
  expect(dockerfile).toContain('CMD ["node", "app.js"]');
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
