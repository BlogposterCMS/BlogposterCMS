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

function commentsDbUpdate(motherEmitter, jwt, rawSQL, params = {}) {
  return emitAsync(motherEmitter, 'dbUpdate', {
    jwt,
    moduleName: 'commentsManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

function commentsDbSelect(motherEmitter, jwt, rawSQL, params = {}) {
  return emitAsync(motherEmitter, 'dbSelect', {
    jwt,
    moduleName: 'commentsManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

async function ensureCommentsDatabase(motherEmitter, jwt, nonce) {
  await emitAsync(motherEmitter, 'createDatabase', {
    jwt,
    moduleName: 'commentsManager',
    moduleType: 'core',
    nonce,
    targetModuleName: 'commentsManager'
  });
}

async function ensureCommentsSchema(motherEmitter, jwt) {
  await commentsDbUpdate(motherEmitter, jwt, 'INIT_COMMENTS_SCHEMA');
  await commentsDbUpdate(motherEmitter, jwt, 'INIT_COMMENTS_TABLES');
}

module.exports = {
  commentsDbSelect,
  commentsDbUpdate,
  emitAsync,
  ensureCommentsDatabase,
  ensureCommentsSchema
};
