'use strict';

const fs = require('fs');
const { computeInstallationCompletion } = require('../../utils/installationState');

function createInstallationStatusService({ installLockPath, motherEmitter }) {
  async function getInstallationStatus() {
    const lockExists = fs.existsSync(installLockPath);

    try {
      const publicToken = await new Promise((resolve, reject) => {
        motherEmitter.emit(
          'issuePublicToken',
          { purpose: 'firstInstallCheck', moduleName: 'auth' },
          (err, token) => (err ? reject(err) : resolve(token))
        );
      });

      const [firstInstallValue, rawUserCount] = await Promise.all([
        new Promise((resolve, reject) => {
          motherEmitter.emit(
            'getPublicSetting',
            {
              jwt: publicToken,
              moduleName: 'settingsManager',
              moduleType: 'core',
              key: 'FIRST_INSTALL_DONE'
            },
            (err, value) => (err ? reject(err) : resolve(value))
          );
        }),
        new Promise((resolve, reject) => {
          motherEmitter.emit(
            'getUserCount',
            { jwt: publicToken, moduleName: 'userManagement', moduleType: 'core' },
            (err, count = 0) => (err ? reject(err) : resolve(count))
          );
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
