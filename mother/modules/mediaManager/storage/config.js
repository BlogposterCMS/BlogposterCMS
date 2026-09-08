'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PROVIDERS = ['local', 'alibaba-oss', 's3'];
const PUBLIC_FIELDS = ['provider', 'bucket', 'region', 'endpoint', 'publicBaseUrl', 'forcePathStyle'];

function fail(code) { throw new Error(`MEDIA_STORAGE_${code}`); }

function httpsUrl(value) {
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { fail('URL_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) fail('URL_INVALID');
  return url.href.replace(/\/$/, '');
}

/** Only these fields cross the settings boundary; SDK options are never caller-controlled. */
function normalizeConfig(input, previous = {}) {
  if (!input || !PROVIDERS.includes(input.provider)) fail('PROVIDER_INVALID');
  const result = { provider: input.provider };
  for (const field of ['bucket', 'region', 'endpoint', 'publicBaseUrl']) {
    if (input[field] != null && typeof input[field] !== 'string') fail('CONFIG_INVALID');
    result[field] = (input[field] || '').trim();
    if (result[field].length > 2000) fail('CONFIG_INVALID');
  }
  result.forcePathStyle = input.forcePathStyle === true;
  result.endpoint = httpsUrl(result.endpoint);
  result.publicBaseUrl = httpsUrl(result.publicBaseUrl);
  // Blank password controls retain credentials only for the same provider.
  for (const field of ['accessKeyId', 'accessKeySecret']) {
    if (input[field] != null && typeof input[field] !== 'string') fail('CONFIG_INVALID');
    result[field] = input[field] || (previous.provider === input.provider ? previous[field] : '') || '';
    if (result[field].length > 4000) fail('CONFIG_INVALID');
  }
  if (result.provider !== 'local') {
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(result.bucket)) fail('BUCKET_INVALID');
    if (!/^[a-z0-9-]{1,80}$/.test(result.region)) fail('REGION_REQUIRED');
    if (result.provider === 'alibaba-oss' && !result.region.startsWith('oss-')) result.region = `oss-${result.region}`;
    // Native provider defaults make CDN setup optional; custom endpoints need an explicit delivery URL.
    if (!result.publicBaseUrl && !result.endpoint) {
      result.publicBaseUrl = result.provider === 'alibaba-oss'
        ? `https://${result.bucket}.${result.region}.aliyuncs.com`
        : `https://${result.bucket}.s3.${result.region}.amazonaws.com`;
    }
    if (!result.publicBaseUrl) fail('PUBLIC_URL_REQUIRED');
    if (!result.accessKeyId || !result.accessKeySecret) fail('CREDENTIALS_REQUIRED');
  } else {
    // Switching to local intentionally drops cloud credentials from the saved configuration.
    return { provider: 'local' };
  }
  return result;
}

function publicConfig(config) {
  return Object.fromEntries([
    ...PUBLIC_FIELDS.map(field => [field, config[field] ?? (field === 'forcePathStyle' ? false : '')]),
    ['credentialsConfigured', Boolean(config.accessKeyId && config.accessKeySecret)]
  ]);
}

/** Settings owns persistence. Its value is authenticated ciphertext, never readable credentials. */
function createConfigStore({ readSetting, writeSetting, keyDirectory }) {
  const keyPath = path.join(keyDirectory, 'storage.key');
  function key(create) {
    if (create) {
      fs.mkdirSync(keyDirectory, { recursive: true, mode: 0o700 });
      try { fs.writeFileSync(keyPath, crypto.randomBytes(32), { flag: 'wx', mode: 0o600 }); }
      catch (error) { if (error.code !== 'EEXIST') fail('KEY_UNAVAILABLE'); }
    }
    try {
      const bytes = fs.readFileSync(keyPath);
      if (bytes.length !== 32) fail('KEY_UNAVAILABLE');
      return bytes;
    } catch { fail('KEY_UNAVAILABLE'); }
  }
  async function read() {
    const stored = await readSetting();
    if (!stored) return { provider: 'local' };
    try {
      const { iv, tag, data } = stored;
      const decipher = crypto.createDecipheriv('aes-256-gcm', key(false), Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return normalizeConfig(JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString()));
    } catch { fail('CONFIG_UNREADABLE'); }
  }
  return {
    read,
    async save(input) {
      const config = normalizeConfig(input, await read());
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key(true), iv);
      const data = Buffer.concat([cipher.update(JSON.stringify(config)), cipher.final()]);
      await writeSetting({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
      return publicConfig(config);
    }
  };
}

module.exports = { createConfigStore, normalizeConfig, publicConfig, httpsUrl, fail };
