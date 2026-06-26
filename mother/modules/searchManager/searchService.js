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

function searchDbUpdate(motherEmitter, jwt, rawSQL, params = {}) {
  return emitAsync(motherEmitter, 'dbUpdate', {
    jwt,
    moduleName: 'searchManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

function searchDbSelect(motherEmitter, jwt, rawSQL, params = {}) {
  return emitAsync(motherEmitter, 'dbSelect', {
    jwt,
    moduleName: 'searchManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

async function ensureSearchDatabase(motherEmitter, jwt, nonce) {
  await emitAsync(motherEmitter, 'createDatabase', {
    jwt,
    moduleName: 'searchManager',
    moduleType: 'core',
    nonce,
    targetModuleName: 'searchManager'
  });
}

async function ensureSearchSchema(motherEmitter, jwt) {
  await searchDbUpdate(motherEmitter, jwt, 'INIT_SEARCH_SCHEMA');
  await searchDbUpdate(motherEmitter, jwt, 'INIT_SEARCH_TABLES');
}

module.exports = {
  emitAsync,
  ensureSearchDatabase,
  ensureSearchSchema,
  searchDbSelect,
  searchDbUpdate
};
