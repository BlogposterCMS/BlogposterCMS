"use strict";

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const path = require("path");
const designerService = require("./designerService");
const { requestBackendEvent } = require('../../contracts/backendEventContracts');

const MANAGER_NAME = "designerManager";
const DESIGNER_RESOURCE_NAME = "designer";
const MODULE_TYPE = "core";
const VERSION = "0.1.0";
const SERVICE_PATH = path.resolve(__dirname, "designerService.js");

function assertCoreInitialize({ motherEmitter, isCore, jwt } = {}) {
  if (!isCore) {
    throw new Error("[DESIGNER MANAGER] Must be loaded as a core module.");
  }
  if (!jwt) {
    throw new Error("[DESIGNER MANAGER] initialization requires a valid JWT token.");
  }
  if (!motherEmitter) {
    throw new Error("[DESIGNER MANAGER] motherEmitter missing.");
  }
}

function capabilities() {
  return {
    moduleName: MANAGER_NAME,
    moduleType: MODULE_TYPE,
    version: VERSION,
    ownsResource: DESIGNER_RESOURCE_NAME,
    servicePath: SERVICE_PATH,
    events: [
      BACKEND_EVENTS.DESIGNER_SAVE_DESIGN,
      BACKEND_EVENTS.DESIGNER_GET_DESIGN,
      BACKEND_EVENTS.DESIGNER_LIST_DESIGNS,
      BACKEND_EVENTS.DESIGNER_GET_LAYOUT,
      BACKEND_EVENTS.DESIGNER_LIST_LAYOUTS
    ]
  };
}

module.exports = {
  lifecycleVersion: 1,
  async healthCheck({ motherEmitter, jwt }) {
    const rows = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.PERFORM_DB_OPERATION, {
      jwt, moduleName: MANAGER_NAME, moduleType: MODULE_TYPE,
      operation: 'DESIGNER_LIST_DESIGNS', params: [{ limit: 1 }]
    });
    if (!Array.isArray(rows)) throw new Error('CORE_MODULE_DESIGNER_NOT_READY');
  },
  async initialize({ motherEmitter, isCore, jwt, nonce, isModuleUpdate = false }) {
    assertCoreInitialize({ motherEmitter, isCore, jwt });

    if (typeof motherEmitter.registerModuleType === "function") {
      motherEmitter.registerModuleType(MANAGER_NAME, MODULE_TYPE);
    }

    await designerService.initialize({
      motherEmitter,
      jwt,
      nonce,
      moduleType: MODULE_TYPE,
      isModuleUpdate
    });

    // The database placeholder authority remains host-owned and fingerprinted.
    // Preparing a candidate must not overwrite the active shared service.
    if (!isModuleUpdate) {
      global.loadedModules = global.loadedModules || {};
      global.loadedModules[MANAGER_NAME] = designerService;
    }
  },

  _internals: {
    capabilities,
    servicePath: SERVICE_PATH,
    MANAGER_NAME,
    DESIGNER_RESOURCE_NAME,
    MODULE_TYPE,
    VERSION
  },
  MANAGER_NAME,
  DESIGNER_RESOURCE_NAME,
  MODULE_TYPE,
  VERSION
};
