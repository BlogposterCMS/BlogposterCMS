'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

function commentsDbUpdate(motherEmitter, jwt, rawSQL, params = {}) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
    jwt,
    moduleName: 'commentsManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

function commentsDbSelect(motherEmitter, jwt, rawSQL, params = {}) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
    jwt,
    moduleName: 'commentsManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

async function ensureCommentsDatabase(motherEmitter, jwt, nonce) {
  await requestBackendEvent(motherEmitter, BACKEND_EVENTS.CREATE_DATABASE, {
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

  ensureCommentsDatabase,
  ensureCommentsSchema
};
