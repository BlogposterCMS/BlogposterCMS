'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

const fs = require('fs');
const { computeInstallationCompletion } = require('../../utils/installationState');

function createInstallationStatusService({ installLockPath, motherEmitter }) {
  async function getInstallationStatus() {
    const lockExists = fs.existsSync(installLockPath);

    try {
      const publicToken = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.ISSUE_PUBLIC_TOKEN, { purpose: 'firstInstallCheck', moduleName: 'auth' });

      const [firstInstallValue, rawUserCount] = await Promise.all([
        requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_PUBLIC_SETTING, {
              jwt: publicToken,
              moduleName: 'settingsManager',
              moduleType: 'core',
              key: 'FIRST_INSTALL_DONE'
            }),
        requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_USER_COUNT, {
  jwt: publicToken,
  moduleName: 'userManagement',
  moduleType: 'core'
}).then((count = 0) => {
  return count;
}, err => {
  throw err;
})
      ]);

      const status = computeInstallationCompletion({
        lockExists,
        firstInstallDone: firstInstallValue,
        userCount: rawUserCount
      });

      if (status.inconsistency === 'lock_without_data') {
        console.warn('[installation] install.lock present without users or FIRST_INSTALL_DONE flag. Treating as incomplete.');
      } else if (status.inconsistency === 'data_without_lock') {
        console.warn('[installation] Users or FIRST_INSTALL_DONE present without install.lock. Treating as complete.');
      }

      return status;
    } catch (err) {
      console.error('[getInstallationStatus] Error while resolving installation state:', err);
      return {
        complete: lockExists,
        lockExists,
        firstInstallDone: false,
        userCount: 0,
        hasPersistentData: false,
        inconsistency: lockExists ? 'lock_without_data' : null,
        error: err
      };
    }
  }

  async function needsInitialSetup() {
    try {
      const status = await getInstallationStatus();
      return !status.complete;
    } catch (err) {
      console.error('[needsInitialSetup] Error:', err);
      return true;
    }
  }

  return {
    getInstallationStatus,
    needsInitialSetup
  };
}

module.exports = {
  createInstallationStatusService
};
