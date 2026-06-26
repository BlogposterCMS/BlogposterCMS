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

function seoDbUpdate(motherEmitter, jwt, rawSQL, params = {}) {
  return emitAsync(motherEmitter, 'dbUpdate', {
    jwt,
    moduleName: 'seoManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

function seoDbSelect(motherEmitter, jwt, rawSQL, params = {}) {
  return emitAsync(motherEmitter, 'dbSelect', {
    jwt,
    moduleName: 'seoManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

async function ensureSeoDatabase(motherEmitter, jwt, nonce) {
  await emitAsync(motherEmitter, 'createDatabase', {
    jwt,
    moduleName: 'seoManager',
    moduleType: 'core',
    nonce,
    targetModuleName: 'seoManager'
  });
}

async function ensureSeoSchema(motherEmitter, jwt) {
  await seoDbUpdate(motherEmitter, jwt, 'INIT_SEO_SCHEMA');
  await seoDbUpdate(motherEmitter, jwt, 'INIT_SEO_TABLES');
}

async function seedSeoDefaults(motherEmitter, jwt) {
  const existing = await seoDbSelect(motherEmitter, jwt, 'GET_SEO_META', {
    targetType: 'global',
    targetKey: 'default'
  });
  if (existing) return;

  await seoDbUpdate(motherEmitter, jwt, 'UPSERT_SEO_META', {
    targetType: 'global',
    targetKey: 'default',
    title: 'Blogposter',
    description: '',
    keywords: '',
    canonicalUrl: '',
    robots: 'index,follow',
    ogImage: '',
    structuredData: {},
    meta: {}
  });
}

module.exports = {
  emitAsync,
  ensureSeoDatabase,
  ensureSeoSchema,
  seedSeoDefaults,
  seoDbSelect,
  seoDbUpdate
};
