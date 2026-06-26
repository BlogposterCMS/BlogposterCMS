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

function redirectDbUpdate(motherEmitter, jwt, rawSQL, params = {}) {
  return emitAsync(motherEmitter, 'dbUpdate', {
    jwt,
    moduleName: 'redirectManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

function redirectDbSelect(motherEmitter, jwt, rawSQL, params = {}) {
  return emitAsync(motherEmitter, 'dbSelect', {
    jwt,
    moduleName: 'redirectManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

async function ensureRedirectDatabase(motherEmitter, jwt, nonce) {
  await emitAsync(motherEmitter, 'createDatabase', {
    jwt,
    moduleName: 'redirectManager',
    moduleType: 'core',
    nonce,
    targetModuleName: 'redirectManager'
  });
}

async function ensureRedirectSchema(motherEmitter, jwt) {
  await redirectDbUpdate(motherEmitter, jwt, 'INIT_REDIRECT_SCHEMA');
  await redirectDbUpdate(motherEmitter, jwt, 'INIT_REDIRECT_TABLES');
}

module.exports = {
  emitAsync,
  ensureRedirectDatabase,
  ensureRedirectSchema,
  redirectDbSelect,
  redirectDbUpdate
};
