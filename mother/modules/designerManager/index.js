"use strict";

const path = require("path");
const legacyDesignerService = require("../../../modules/designer");

const MANAGER_NAME = "designerManager";
const LEGACY_MODULE_NAME = "designer";
const MODULE_TYPE = "core";
const VERSION = "0.1.0";
const LEGACY_SERVICE_PATH = path.resolve(__dirname, "../../../modules/designer");

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
    ownsLegacyModule: LEGACY_MODULE_NAME,
    legacyServicePath: LEGACY_SERVICE_PATH,
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
      motherEmitter.registerModuleType(LEGACY_MODULE_NAME, MODULE_TYPE);
    }

    await legacyDesignerService.initialize({
      motherEmitter,
      jwt,
      nonce,
      moduleType: MODULE_TYPE
    });

    global.loadedModules = global.loadedModules || {};
    global.loadedModules[LEGACY_MODULE_NAME] = legacyDesignerService;
  },

  _internals: {
    capabilities,
    legacyServicePath: LEGACY_SERVICE_PATH,
    MANAGER_NAME,
    LEGACY_MODULE_NAME,
    MODULE_TYPE,
    VERSION
  },
  MANAGER_NAME,
  LEGACY_MODULE_NAME,
  MODULE_TYPE,
  VERSION
};
