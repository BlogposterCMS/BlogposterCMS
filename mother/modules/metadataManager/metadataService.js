'use strict';

function once(originalCb) {
  let fired = false;
  return (...args) => {
    if (fired) return;
    fired = true;
    if (typeof originalCb === 'function') originalCb(...args);
  };
}

function emitAsync(motherEmitter, eventName, payload) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(eventName, payload, once((err, result) => {
      if (err) return reject(err);
      resolve(result);
    }));
  });
}

function metadataDbUpdate(motherEmitter, jwt, rawSQL, params = {}) {
  return emitAsync(motherEmitter, 'dbUpdate', {
    jwt,
    moduleName: 'metadataManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

function metadataDbSelect(motherEmitter, jwt, rawSQL, params = {}) {
  return emitAsync(motherEmitter, 'dbSelect', {
    jwt,
    moduleName: 'metadataManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

async function ensureMetadataDatabase(motherEmitter, jwt, nonce) {
  await emitAsync(motherEmitter, 'createDatabase', {
    jwt,
    moduleName: 'metadataManager',
    moduleType: 'core',
    nonce,
    targetModuleName: 'metadataManager'
  });
}

async function ensureMetadataSchema(motherEmitter, jwt) {
  await metadataDbUpdate(motherEmitter, jwt, 'INIT_METADATA_SCHEMA');
  await metadataDbUpdate(motherEmitter, jwt, 'INIT_METADATA_TABLES');
}

module.exports = {
  emitAsync,
  ensureMetadataDatabase,
  ensureMetadataSchema,
  metadataDbSelect,
  metadataDbUpdate
};
