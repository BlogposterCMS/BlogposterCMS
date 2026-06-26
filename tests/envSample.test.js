const fs = require('fs');
const path = require('path');

function parseEnvSample() {
  const samplePath = path.join(__dirname, '..', 'env.sample');
  const content = fs.readFileSync(samplePath, 'utf8');
  const values = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex);
    values[key] = trimmed.slice(equalsIndex + 1);
  }

  return values;
}

test('env.sample defaults to the local SQLite startup path', () => {
  const env = parseEnvSample();

  expect(env.CONTENT_DB_TYPE).toBe('sqlite');
  expect(env.SQLITE_STORAGE).toBe('./data');
  expect(env.SQLITE_MAIN_FILE).toBe('cms.sqlite');
  expect(env.MONGODB_URI).toBe('');
});

test('env.sample lists required startup secrets without committing real values', () => {
  const env = parseEnvSample();

  expect(env.JWT_SECRET).toBe('YOUR_SECURE_JWT_SECRET_HERE');
  expect(env.AUTH_MODULE_INTERNAL_SECRET).toBe('YOUR_AUTH_MODULE_SECRET');
  expect(env.APP_FRAME_ALLOWED_ORIGINS).toBe('http://localhost:3000');
  expect(env.APP_FRAME_ORIGIN_TOKEN_PRIVATE_KEY).toBe('');
  expect(env.APP_FRAME_ORIGIN_TOKEN_PUBLIC_KEY).toBe('');
  expect(env.DEV_AUTOLOGIN).toBe('true');
  expect(env.DEV_AGENT_LOGIN).toBe('true');
  expect(env.ALLOW_WEAK_CREDS).toBe('I_KNOW_THIS_IS_LOCAL');
  expect(env.DEV_FILE_LOGS).toBe('');
});
