'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

function metadataDbUpdate(motherEmitter, jwt, rawSQL, params = {}) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
    jwt,
    moduleName: 'metadataManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

function metadataDbSelect(motherEmitter, jwt, rawSQL, params = {}) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
    jwt,
    moduleName: 'metadataManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

async function ensureMetadataDatabase(motherEmitter, jwt, nonce) {
  await requestBackendEvent(motherEmitter, BACKEND_EVENTS.CREATE_DATABASE, {
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

  ensureMetadataDatabase,
  ensureMetadataSchema,
  metadataDbSelect,
  metadataDbUpdate
};
