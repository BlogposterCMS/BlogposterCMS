'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

function redirectDbUpdate(motherEmitter, jwt, rawSQL, params = {}) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
    jwt,
    moduleName: 'redirectManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

function redirectDbSelect(motherEmitter, jwt, rawSQL, params = {}) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
    jwt,
    moduleName: 'redirectManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

async function ensureRedirectDatabase(motherEmitter, jwt, nonce) {
  await requestBackendEvent(motherEmitter, BACKEND_EVENTS.CREATE_DATABASE, {
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

  ensureRedirectDatabase,
  ensureRedirectSchema,
  redirectDbSelect,
  redirectDbUpdate
};
