'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { getAdapter, adapterDefinitions } = require('./adapterRegistry');

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
  if (!input || typeof input.provider !== 'string') fail('PROVIDER_INVALID');
  const adapter = getAdapter(input.provider);
  const result = { provider: input.provider };
  for (const field of adapter.definition.fields) {
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(field.name)) fail('ADAPTER_INVALID');
    if (field.type === 'checkbox') { result[field.name] = input[field.name] === true; continue; }
    const value = input[field.name];
    if (value != null && typeof value !== 'string') fail('CONFIG_INVALID');
    result[field.name] = field.secret
      ? value || (previous.provider === input.provider ? previous[field.name] : '') || ''
      : (value || '').trim();
    if (result[field.name].length > 4000) fail('CONFIG_INVALID');
    if (field.type === 'url') result[field.name] = httpsUrl(result[field.name]);
    if (field.required && !result[field.name]) fail(field.secret ? 'CREDENTIALS_REQUIRED' : 'FIELD_REQUIRED');
  }
  return adapter.normalize ? adapter.normalize(result, { fail, httpsUrl }) : result;
}

function publicConfig(config) {
  const definition = getAdapter(config.provider).definition;
  return { provider: config.provider,
    ...Object.fromEntries(definition.fields.filter(field => !field.secret).map(field => [field.name, config[field.name] ?? ''])),
    credentialsConfigured: definition.fields.some(field => field.secret) && definition.fields.filter(field => field.secret && field.required).every(field => Boolean(config[field.name]))
  };
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
  const local = () => ({ connectionId: 'local', name: 'Local server', provider: 'local' });
  async function readAll() {
    const stored = await readSetting();
    if (!stored) return { version: 2, defaultConnectionId: 'local', connections: [local()] };
    try {
      const { iv, tag, data } = stored;
      const decipher = crypto.createDecipheriv('aes-256-gcm', key(false), Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      const decoded = JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString());
      // Preserve the original single connection and its credentials during the first upgrade.
      if (!decoded.version) {
        const config = normalizeConfig(decoded);
        return config.provider === 'local' ? { version: 2, defaultConnectionId: 'local', connections: [local()] }
          : { version: 2, defaultConnectionId: 'legacy', connections: [local(), { ...config, connectionId: 'legacy', name: getAdapter(config.provider).definition.label }] };
      }
      if (decoded.version !== 2 || !Array.isArray(decoded.connections) || decoded.connections.length > 50) fail('CONFIG_INVALID');
      const ids = new Set();
      const connections = decoded.connections.map(connection => {
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(connection.connectionId) || ids.has(connection.connectionId)) fail('CONFIG_INVALID');
        ids.add(connection.connectionId);
        if (connection.connectionId === 'local') return local();
        return { ...normalizeConfig(connection), connectionId: connection.connectionId, name: String(connection.name || '').slice(0, 120) };
      });
      if (!ids.has('local') || !ids.has(decoded.defaultConnectionId)) fail('CONFIG_INVALID');
      return { version: 2, defaultConnectionId: decoded.defaultConnectionId, connections };
    } catch { fail('CONFIG_UNREADABLE'); }
  }
  async function read(connectionId) {
    const document = await readAll();
    const selected = document.connections.find(connection => connection.connectionId === (connectionId || document.defaultConnectionId));
    if (!selected) fail('CONNECTION_NOT_FOUND');
    return selected;
  }
  function snapshot(document, selectedId = document.defaultConnectionId) {
    const selected = document.connections.find(connection => connection.connectionId === selectedId);
    return { ...publicConfig(selected), connectionId: selected.connectionId, name: selected.name,
      defaultConnectionId: document.defaultConnectionId,
      adapters: adapterDefinitions(), connections: document.connections.map(connection => ({
        ...publicConfig(connection), connectionId: connection.connectionId, name: connection.name
      })) };
  }
  let saving = Promise.resolve();
  return {
    read, readAll,
    async snapshot() { return snapshot(await readAll()); },
    save(input) {
      // Serialize updates so simultaneous forms cannot overwrite other connections in this process.
      const operation = saving.then(async () => {
        const document = await readAll();
        const requested = input.connectionId || document.defaultConnectionId;
        const previous = requested === 'new' ? {} : document.connections.find(connection => connection.connectionId === requested);
        if (!previous) fail('CONNECTION_NOT_FOUND');
        const config = normalizeConfig(input, previous);
        let id = config.provider === 'local' ? 'local' : requested === 'new' || previous.provider !== config.provider ? crypto.randomUUID() : requested;
        const name = typeof input.name === 'string' ? input.name.trim().slice(0, 120) : previous.name || getAdapter(config.provider).definition.label;
        if (!name) fail('NAME_REQUIRED');
        const connection = { ...config, connectionId: id, name };
        const index = document.connections.findIndex(item => item.connectionId === id);
        if (index === -1) document.connections.push(connection); else document.connections[index] = connection;
        if (document.connections.length > 50) fail('CONNECTION_LIMIT');
        if (input.makeDefault === true || !input.connectionId) document.defaultConnectionId = id;
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key(true), iv);
        const data = Buffer.concat([cipher.update(JSON.stringify(document)), cipher.final()]);
        await writeSetting({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
        return snapshot(document, id);
      });
      saving = operation.catch(() => {});
      return operation;
    }
  };
}

module.exports = { createConfigStore, normalizeConfig, publicConfig, httpsUrl, fail };
