'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

async function reconcileFirstInstallDone({ motherEmitter, getCachedCoreToken }) {
  try {
    const settingsManagerToken = await getCachedCoreToken('settingsManager');
    const userManagementToken = await getCachedCoreToken('userManagement');
    const firstInstallDone = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_SETTING, {
          jwt: settingsManagerToken,
          moduleName: 'settingsManager',
          moduleType: 'core',
          key: 'FIRST_INSTALL_DONE'
        });

    if (firstInstallDone === 'true') {
      console.log('[APP] FIRST_INSTALL_DONE is "true" => skipping initial seeding.');
      return;
    }

    const userCount = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_USER_COUNT, {
  jwt: userManagementToken,
  moduleName: 'userManagement',
  moduleType: 'core'
}).then((count = 0) => {
  return count;
}, err => {
  throw err;
});

    if (userCount > 0) {
      console.log('[APP] FIRST_INSTALL_DONE false but users exist => marking installed.');
      await requestBackendEvent(motherEmitter, BACKEND_EVENTS.SET_SETTING, {
            jwt: settingsManagerToken,
            moduleName: 'settingsManager',
            moduleType: 'core',
            key: 'FIRST_INSTALL_DONE',
            value: 'true'
          });
      console.log('[APP] FIRST_INSTALL_DONE set to "true" based on existing users.');
    } else {
      console.log('[APP] FIRST_INSTALL_DONE false and no users => waiting for installation.');
    }
  } catch (err) {
    console.error('[APP] Could not check/set FIRST_INSTALL_DONE:', err.message);
  }
}

module.exports = {
  reconcileFirstInstallDone
};
