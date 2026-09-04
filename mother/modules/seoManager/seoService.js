'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

function seoDbUpdate(motherEmitter, jwt, rawSQL, params = {}) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
    jwt,
    moduleName: 'seoManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

function seoDbSelect(motherEmitter, jwt, rawSQL, params = {}) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
    jwt,
    moduleName: 'seoManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

async function ensureSeoDatabase(motherEmitter, jwt, nonce) {
  await requestBackendEvent(motherEmitter, BACKEND_EVENTS.CREATE_DATABASE, {
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

  ensureSeoDatabase,
  ensureSeoSchema,
  seedSeoDefaults,
  seoDbSelect,
  seoDbUpdate
};
