const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { parseEnv } = require('node:util');
const { createInstallConfig } = require('../deploy/create-install-config');
let root;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-install-')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('fresh installation creates unique secrets, valid keys and canonical deployment paths', () => {
  createInstallConfig({ root, origin: 'https://cms.example.com' });
  const values = parseEnv(fs.readFileSync(path.join(root, 'runtime.env'), 'utf8'));
  expect(values.PUBLIC_URL).toBe('https://cms.example.com');
  expect(values.JWT_SECRET).toMatch(/^[a-f0-9]{96}$/);
  expect(values.JWT_SECRET).not.toBe(values.AUTH_MODULE_INTERNAL_SECRET);
  const signature = crypto.sign('sha256', Buffer.from('origin'), values.APP_FRAME_ORIGIN_TOKEN_PRIVATE_KEY);
  expect(crypto.verify('sha256', Buffer.from('origin'), values.APP_FRAME_ORIGIN_TOKEN_PUBLIC_KEY, signature)).toBe(true);
  expect(fs.readFileSync(path.join(root, 'deployment.env'), 'utf8')).toContain('BLOGPOSTER_PROXY_NETWORK=blogposter-proxy');
  const before = fs.readFileSync(path.join(root, 'runtime.env'));
  expect(() => createInstallConfig({ root, origin: 'https://other.example.com' })).toThrow('CORE_INSTALL_CONFIG_EXISTS');
  expect(fs.readFileSync(path.join(root, 'runtime.env'))).toEqual(before);
});

test.each(['http://cms.example.com', 'https://user:password@cms.example.com', 'https://cms.example.com/path', 'https://cms.example.com/?value=x', 'bad\nURL'])('invalid origin fails before files are written: %s', origin => {
  expect(() => createInstallConfig({ root, origin })).toThrow('CORE_INSTALL_ORIGIN_INVALID');
  expect(fs.readdirSync(root)).toEqual([]);
});

test('invalid network cannot become Compose or shell input', () => {
  expect(() => createInstallConfig({ root, origin: 'https://cms.example.com', network: 'test\nEVIL=1' })).toThrow('CORE_INSTALL_NETWORK_INVALID');
  expect(fs.readdirSync(root)).toEqual([]);
});
