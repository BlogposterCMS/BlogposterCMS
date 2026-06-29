'use strict';

async function reconcileFirstInstallDone({ motherEmitter, getCachedCoreToken }) {
  try {
    const settingsManagerToken = await getCachedCoreToken('settingsManager');
    const userManagementToken = await getCachedCoreToken('userManagement');
    const firstInstallDone = await new Promise((resolve, reject) => {
      motherEmitter.emit(
        'getSetting',
        {
          jwt: settingsManagerToken,
          moduleName: 'settingsManager',
          moduleType: 'core',
          key: 'FIRST_INSTALL_DONE'
        },
        (err, val) => err ? reject(err) : resolve(val)
      );
    });

    if (firstInstallDone === 'true') {
      console.log('[APP] FIRST_INSTALL_DONE is "true" => skipping initial seeding.');
      return;
    }

    const userCount = await new Promise((resolve, reject) => {
      motherEmitter.emit(
        'getUserCount',
        { jwt: userManagementToken, moduleName: 'userManagement', moduleType: 'core' },
        (err, count = 0) => (err ? reject(err) : resolve(count))
      );
    });

    if (userCount > 0) {
      console.log('[APP] FIRST_INSTALL_DONE false but users exist => marking installed.');
      await new Promise((resolve, reject) => {
        motherEmitter.emit(
          'setSetting',
          {
            jwt: settingsManagerToken,
            moduleName: 'settingsManager',
            moduleType: 'core',
            key: 'FIRST_INSTALL_DONE',
            value: 'true'
          },
          err => err ? reject(err) : resolve()
        );
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
