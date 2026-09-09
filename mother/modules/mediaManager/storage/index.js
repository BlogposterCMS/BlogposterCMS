'use strict';

const { fail } = require('./config');
const { getAdapter } = require('./adapterRegistry');

/** Stable internal contract: put, head, delete, test, downloadUrl. No second media catalog. */
function createStorageAdapter(config, localOptions = {}, dependencies = {}) {
  const factory = getAdapter(config.provider);
  const adapter = factory(config.provider === 'local' ? localOptions : config, dependencies);
  return Object.fromEntries(Object.entries(adapter).map(([operation, handler]) => [operation, async (...args) => {
    const key = operation === 'put' ? args[0]?.key : args[0];
    if (operation !== 'test') {
      if (typeof key !== 'string' || /[\\\u0000-\u001f]/.test(key)
        || (key !== '' && key.split('/').some(part => !part || part === '.' || part === '..'))
        || (key === '' && operation !== 'list')) fail('KEY_INVALID');
      // Broad browsing never broadens the existing immutable download write/delete boundary.
      if (['put', 'delete'].includes(operation) && !/^downloads\/[a-zA-Z0-9/_.-]+$/.test(key)) fail('KEY_INVALID');
    }
    try { return await handler(...args); }
    catch { fail(`${operation.toUpperCase()}_FAILED`); } // SDK errors may contain signed requests or credentials.
  }]));
}

function publicDeliveryUrl(config, key) {
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return config.provider === 'local' ? `/media/${encoded}` : config.publicBaseUrl ? `${config.publicBaseUrl}/${encoded}` : '';
}

module.exports = { createStorageAdapter, publicDeliveryUrl };
