'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

function navigationDbUpdate(motherEmitter, jwt, rawSQL, params = {}) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
    jwt,
    moduleName: 'navigationManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

function navigationDbSelect(motherEmitter, jwt, rawSQL, params = {}) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
    jwt,
    moduleName: 'navigationManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

async function ensureNavigationDatabase(motherEmitter, jwt, nonce) {
  await requestBackendEvent(motherEmitter, BACKEND_EVENTS.CREATE_DATABASE, {
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

  ensureNavigationDatabase,
  ensureNavigationSchema,
  navigationDbSelect,
  navigationDbUpdate,
  seedDefaultNavigationLocations
};
