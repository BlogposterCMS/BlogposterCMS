'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

function workflowDbUpdate(motherEmitter, jwt, rawSQL, params = {}) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
    jwt,
    moduleName: 'workflowManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

function workflowDbSelect(motherEmitter, jwt, rawSQL, params = {}) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
    jwt,
    moduleName: 'workflowManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

async function ensureWorkflowDatabase(motherEmitter, jwt, nonce) {
  await requestBackendEvent(motherEmitter, BACKEND_EVENTS.CREATE_DATABASE, {
    jwt,
    moduleName: 'workflowManager',
    moduleType: 'core',
    nonce,
    targetModuleName: 'workflowManager'
  });
}

async function ensureWorkflowSchema(motherEmitter, jwt) {
  await workflowDbUpdate(motherEmitter, jwt, 'INIT_WORKFLOW_SCHEMA');
  await workflowDbUpdate(motherEmitter, jwt, 'INIT_WORKFLOW_TABLES');
}

module.exports = {

  ensureWorkflowDatabase,
  ensureWorkflowSchema,
  workflowDbSelect,
  workflowDbUpdate
};
