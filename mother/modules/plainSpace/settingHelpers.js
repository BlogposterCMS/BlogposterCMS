// mother/modules/plainSpace/settingHelpers.js
// So we can be sure our getSetting and setSetting calls are a separate headache.

function getSetting(motherEmitter, jwt, key) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(
      'getSetting',
      {
        jwt,
        moduleName: 'settingsManager',
        moduleType: 'core',
        key
      },
      (err, value) => {
        if (err) return reject(err);
        resolve(value);
      }
    );
  });
}

function setSetting(motherEmitter, jwt, key, value) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(
      'setSetting',
      {
        jwt,
        moduleName: 'settingsManager',
        moduleType: 'core',
        key,
        value
      },
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

module.exports = {
  getSetting,
  setSetting
};
