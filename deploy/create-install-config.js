'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createInstallConfig({ root, origin, network = 'blogposter-proxy', assetDir = __dirname }) {
  let url;
  try { url = new URL(origin); } catch { throw new Error('CORE_INSTALL_ORIGIN_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('CORE_INSTALL_ORIGIN_INVALID: use an HTTPS origin without a path');
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/.test(network)) throw new Error('CORE_INSTALL_NETWORK_INVALID');
  if (fs.existsSync(root) && (fs.lstatSync(root).isSymbolicLink() || !fs.statSync(root).isDirectory())) {
    throw new Error('CORE_INSTALL_DIRECTORY_INVALID');
  }
  // Fresh-install only: never rotate a running site's secrets or overwrite its deployment.
  const files = ['runtime.env', 'deployment.env', 'updater.conf', 'blogposter.compose.yml'];
  if (files.some(file => fs.existsSync(path.join(root, file)))) throw new Error('CORE_INSTALL_CONFIG_EXISTS');
  const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const runtime = { PUBLIC_URL: url.origin, APP_BASE_URL: url.origin, APP_FRAME_ALLOWED_ORIGINS: url.origin,
    APP_FRAME_ORIGIN_TOKEN_PRIVATE_KEY: keys.privateKey, APP_FRAME_ORIGIN_TOKEN_PUBLIC_KEY: keys.publicKey };
  for (const key of ['JWT_SECRET', 'AUTH_MODULE_INTERNAL_SECRET', 'FONTS_MODULE_INTERNAL_SECRET',
    'USER_PASSWORD_SALT', 'MODULE_DB_SALT', 'TOKEN_SALT_HIGH', 'TOKEN_SALT_MEDIUM', 'TOKEN_SALT_LOW', 'MODULE_SECRET_SALT']) {
    runtime[key] = crypto.randomBytes(48).toString('hex');
  }
  // Compose's env-file parser expands escaped newlines in double-quoted PEM values.
  const runtimeEnv = Object.entries(runtime).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n';
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const write = (name, text) => fs.writeFileSync(path.join(root, name), text, { flag: 'wx', mode: 0o600 });
  write('runtime.env', runtimeEnv);
  write('deployment.env', `BLOGPOSTER_ENV_FILE=${root}/runtime.env\nBLOGPOSTER_OVERRIDES_DIR=${root}/customizations/module-overrides\nBLOGPOSTER_PROXY_NETWORK=${network}\n`);
  write('updater.conf', fs.readFileSync(path.join(assetDir, 'blogposter-updater.conf.example'), 'utf8'));
  write('blogposter.compose.yml', fs.readFileSync(path.join(assetDir, 'blogposter.compose.yml'), 'utf8'));
  fs.mkdirSync(path.join(root, 'customizations/module-overrides'), { recursive: true, mode: 0o755 });
  return { origin: url.origin, network };
}

if (require.main === module) {
  try { createInstallConfig({ root: '/opt/blogposter', origin: process.argv[2], network: process.argv[3] }); }
  catch (err) { console.error(err.message); process.exitCode = 1; }
}
module.exports = { createInstallConfig };
