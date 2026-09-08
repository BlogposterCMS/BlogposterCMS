'use strict';

const { fail } = require('./config');
const factories = {
  local: require('./local'),
  'alibaba-oss': require('./alibaba'),
  s3: require('./s3')
};

/** Stable internal contract: put, head, delete, test, downloadUrl. No second media catalog. */
function createStorageAdapter(config, localOptions = {}, dependencies = {}) {
  const factory = Object.hasOwn(factories, config.provider) && factories[config.provider];
  if (!factory) fail('PROVIDER_INVALID');
  const adapter = factory(config.provider === 'local' ? localOptions : config, dependencies);
  return Object.fromEntries(Object.entries(adapter).map(([operation, handler]) => [operation, async (...args) => {
    const key = operation === 'put' ? args[0]?.key : args[0];
    if (operation !== 'test' && (typeof key !== 'string' || !/^downloads\/[a-zA-Z0-9/_.-]+$/.test(key)
      || key.split('/').some(part => !part || part === '.' || part === '..'))) fail('KEY_INVALID');
    try { return await handler(...args); }
    catch { fail(`${operation.toUpperCase()}_FAILED`); } // SDK errors may contain signed requests or credentials.
  }]));
}

function publicDeliveryUrl(config, key) {
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return config.provider === 'local' ? `/media/${encoded}` : `${config.publicBaseUrl}/${encoded}`;
}

module.exports = { createStorageAdapter, publicDeliveryUrl };
