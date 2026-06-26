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

function workflowDbUpdate(motherEmitter, jwt, rawSQL, params = {}) {
  return emitAsync(motherEmitter, 'dbUpdate', {
    jwt,
    moduleName: 'workflowManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

function workflowDbSelect(motherEmitter, jwt, rawSQL, params = {}) {
  return emitAsync(motherEmitter, 'dbSelect', {
    jwt,
    moduleName: 'workflowManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

async function ensureWorkflowDatabase(motherEmitter, jwt, nonce) {
  await emitAsync(motherEmitter, 'createDatabase', {
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
  emitAsync,
  ensureWorkflowDatabase,
  ensureWorkflowSchema,
  workflowDbSelect,
  workflowDbUpdate
};
