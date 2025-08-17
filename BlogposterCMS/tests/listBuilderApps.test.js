const path = require('path');
const EventEmitter = require('events');
const appLoader = require('../mother/modules/appLoader/index.js');

class MockEmitter extends EventEmitter {
  emit(event, payload, cb) {
    if (event === 'dbUpdate' || event === 'dbSelect') {
      if (typeof cb === 'function') cb(null, []);
      return true;
    }
    return super.emit(event, payload, cb);
  }
}

test('listBuilderApps returns available builders', async () => {
  const emitter = new MockEmitter();
  await appLoader.initialize({ motherEmitter: emitter, isCore: true, jwt: 'jwt', baseDir: path.join(__dirname, '..', 'apps') });
  await new Promise((resolve, reject) => {
    emitter.emit('listBuilderApps', { decodedJWT: { permissions: { builder: { use: true } } } }, (err, data) => {
      try {
        expect(err).toBeFalsy();
        expect(Array.isArray(data.apps)).toBe(true);
        expect(data.apps.find(a => a.name === 'designer')).toBeTruthy();
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
});
