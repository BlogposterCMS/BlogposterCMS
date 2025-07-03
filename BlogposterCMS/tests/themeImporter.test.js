const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const EventEmitter = require('events');

function onceWrap(cb) {
  let called = false;
  return (...args) => {
    if (called) return;
    called = true;
    if (typeof cb === 'function') cb(...args);
  };
}

function loadModule(relPath) {
  const base = path.resolve(__dirname, '..', relPath);
  const code = fs.readFileSync(path.join(base, 'index.js'), 'utf8');
  function customRequire(name) {
    if (name === '../../mother/emitters/motherEmitter' || name === '../emitters/motherEmitter') {
      return { onceCallback: onceWrap };
    }
    if (name.startsWith('./') || name.startsWith('../')) {
      return require(path.join(base, name));
    }
    return require(name);
  }
  const sandbox = { module: {}, exports: {}, require: customRequire, console };
  sandbox.__dirname = base;
  vm.runInNewContext(code, sandbox, { filename: path.join(relPath, 'index.js') });
  return sandbox.module.exports;
}


async function testImporter() {
  const imp = loadModule('mother/modules/importer');
  const em = new EventEmitter();
  await imp.initialize({ motherEmitter: em, isCore: true, jwt: 't' });

  await new Promise((resolve, reject) => {
    em.emit('runImport', { jwt: 't', moduleName: 'importer', moduleType: 'core', importerName: 'wordpress' }, (err, res) => {
      if (err) return reject(err);
      assert(res && res.success !== undefined);
      resolve();
    });
  });

  await new Promise(resolve => {
    em.emit('runImport', { importerName: 'wordpress', moduleName: 'importer', moduleType: 'core' }, err => { assert(err); resolve(); });
  });
}

test('importer module works', async () => {
  await testImporter();
});

