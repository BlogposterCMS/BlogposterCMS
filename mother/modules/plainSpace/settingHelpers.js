

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

// mother/modules/plainSpace/settingHelpers.js
// So we can be sure our getSetting and setSetting calls are a separate headache.

function getSetting(motherEmitter, jwt, key) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_SETTING, {
        jwt,
        moduleName: 'settingsManager',
        moduleType: 'core',
        key
      });
}

function setSetting(motherEmitter, jwt, key, value) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.SET_SETTING, {
        jwt,
        moduleName: 'settingsManager',
        moduleType: 'core',
        key,
        value
      });
}

module.exports = {
  getSetting,
  setSetting
};
