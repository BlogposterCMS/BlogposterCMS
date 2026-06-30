"use strict";

const path = require("path");
const designerService = require("./designerService");

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
      "designer.saveDesign",
      "designer.getDesign",
      "designer.listDesigns",
      "designer.getLayout",
      "designer.listLayouts"
    ]
  };
}

module.exports = {
  async initialize({ motherEmitter, isCore, jwt, nonce }) {
    assertCoreInitialize({ motherEmitter, isCore, jwt });

    if (typeof motherEmitter.registerModuleType === "function") {
      motherEmitter.registerModuleType(MANAGER_NAME, MODULE_TYPE);
    }

    await designerService.initialize({
      motherEmitter,
      jwt,
      nonce,
      moduleType: MODULE_TYPE
    });

    global.loadedModules = global.loadedModules || {};
    global.loadedModules[MANAGER_NAME] = designerService;
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
