'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

function searchDbUpdate(motherEmitter, jwt, rawSQL, params = {}) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
    jwt,
    moduleName: 'searchManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

function searchDbSelect(motherEmitter, jwt, rawSQL, params = {}) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
    jwt,
    moduleName: 'searchManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

async function ensureSearchDatabase(motherEmitter, jwt, nonce) {
  await requestBackendEvent(motherEmitter, BACKEND_EVENTS.CREATE_DATABASE, {
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

  ensureSearchDatabase,
  ensureSearchSchema,
  searchDbSelect,
  searchDbUpdate
};
