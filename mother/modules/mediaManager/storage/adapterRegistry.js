'use strict';

const fs = require('node:fs');
const path = require('node:path');
let registered;

/** Like auth/strategies, only trusted files shipped in this server directory are loaded. */
function adapters() {
  if (registered) return registered;
  const result = new Map();
  const root = path.join(__dirname, 'adapters');
  for (const file of fs.readdirSync(root).filter(name => name.endsWith('.js')).sort()) {
    const adapter = require(path.join(root, file));
    const definition = adapter.definition;
    if (typeof adapter !== 'function' || !definition || !/^[a-z][a-z0-9-]+$/.test(definition.id)
      || result.has(definition.id) || !Array.isArray(definition.fields)) throw new Error('MEDIA_STORAGE_ADAPTER_INVALID');
    result.set(definition.id, adapter);
  }
  registered = result;
  return result;
}

function getAdapter(id) {
  const adapter = adapters().get(id);
  if (!adapter) throw new Error('MEDIA_STORAGE_PROVIDER_INVALID');
  return adapter;
}

function adapterDefinitions() {
  return [...adapters().values()].map(adapter => adapter.definition);
}

module.exports = { getAdapter, adapterDefinitions };
