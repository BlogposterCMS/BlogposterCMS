'use strict';

const fs = require('fs');
const path = require('path');

function abortConfigError(msg, howToFix) {
  console.error('\n==================  BLOGPOSTER CMS - CONFIG ERROR  ==================');
  console.error('x ' + msg);
  if (howToFix) {
    console.error('\nHow to fix:');
    console.error('  -> ' + howToFix.split('\n').join('\n  '));
  }
  console.error('=====================================================================\n');
  process.exit(1);
}

function ensureRequiredEnv(env = process.env) {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 64) {
    abortConfigError(
      'Missing or too-short JWT_SECRET (min. 64 random hex chars).',
      'Run:\n' +
      '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
      'and add it to .env as JWT_SECRET=<paste>'
    );
  }

  if (!env.AUTH_MODULE_INTERNAL_SECRET || env.AUTH_MODULE_INTERNAL_SECRET.length < 48) {
    abortConfigError(
      'Missing/short AUTH_MODULE_INTERNAL_SECRET (min. 48 chars).',
      'Run:\n' +
      '  node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'hex\'))"\n' +
      'and add it to .env as AUTH_MODULE_INTERNAL_SECRET=<paste>'
    );
  }
}

function loadSecretsOverrides({ rootDir }) {
  const overridesDir = path.join(rootDir, 'overrides');
  if (!fs.existsSync(overridesDir)) return;

  fs.readdirSync(overridesDir)
    .filter(fileName => fileName.endsWith('.secrets.js'))
    .forEach(fileName => {
      try {
        require(path.join(overridesDir, fileName));
        console.log(`[SECRETS] Loaded override ${fileName}`);
      } catch (err) {
        console.error(`[SECRETS] Failed to load ${fileName}:`, err.message);
      }
    });
}

function loadPlainSpaceVersion({ rootDir }) {
  try {
    const infoPath = path.join(rootDir, 'mother', 'modules', 'plainSpace', 'moduleInfo.json');
    if (!fs.existsSync(infoPath)) return '';
    const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
    return typeof info?.version === 'string' ? info.version : '';
  } catch (err) {
    console.warn('[SERVER] Failed to load PlainSpace moduleInfo:', err.message);
    return '';
  }
}

function activeThemeFromEnv(env = process.env) {
  return (env.ACTIVE_THEME || 'default').replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
}

function createTokenConfig(env = process.env) {
  return {
    jwtSecret: env.JWT_SECRET,
    authModuleSecret: env.AUTH_MODULE_INTERNAL_SECRET,
    userPasswordSalt: env.USER_PASSWORD_SALT || '',
    moduleDbSalt: env.MODULE_DB_SALT || '',
    tokenSalts: {
      high: env.TOKEN_SALT_HIGH,
      medium: env.TOKEN_SALT_MEDIUM,
      low: env.TOKEN_SALT_LOW
    },
    jwtExpiryConfig: {
      high: env.JWT_EXPIRY_HIGH,
      medium: env.JWT_EXPIRY_MEDIUM,
      low: env.JWT_EXPIRY_LOW
    }
  };
}

module.exports = {
  abortConfigError,
  activeThemeFromEnv,
  createTokenConfig,
  ensureRequiredEnv,
  loadPlainSpaceVersion,
  loadSecretsOverrides
};
