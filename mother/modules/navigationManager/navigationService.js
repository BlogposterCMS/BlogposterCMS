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

function navigationDbUpdate(motherEmitter, jwt, rawSQL, params = {}) {
  return emitAsync(motherEmitter, 'dbUpdate', {
    jwt,
    moduleName: 'navigationManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

function navigationDbSelect(motherEmitter, jwt, rawSQL, params = {}) {
  return emitAsync(motherEmitter, 'dbSelect', {
    jwt,
    moduleName: 'navigationManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

async function ensureNavigationDatabase(motherEmitter, jwt, nonce) {
  await emitAsync(motherEmitter, 'createDatabase', {
    jwt,
    moduleName: 'navigationManager',
    moduleType: 'core',
    nonce,
    targetModuleName: 'navigationManager'
  });
}

async function ensureNavigationSchema(motherEmitter, jwt) {
  await navigationDbUpdate(motherEmitter, jwt, 'INIT_NAVIGATION_SCHEMA');
  await navigationDbUpdate(motherEmitter, jwt, 'INIT_NAVIGATION_TABLES');
}

async function seedDefaultNavigationLocations(motherEmitter, jwt) {
  const defaults = [
    { key: 'primary', label: 'Primary Navigation', description: 'Main public site navigation.' },
    { key: 'footer', label: 'Footer Navigation', description: 'Footer links and legal navigation.' },
    { key: 'admin', label: 'Admin Navigation', description: 'Administrative navigation surface.' }
  ];

  for (const location of defaults) {
    await navigationDbUpdate(motherEmitter, jwt, 'UPSERT_NAVIGATION_LOCATION', location);
  }
}

module.exports = {
  emitAsync,
  ensureNavigationDatabase,
  ensureNavigationSchema,
  navigationDbSelect,
  navigationDbUpdate,
  seedDefaultNavigationLocations
};
