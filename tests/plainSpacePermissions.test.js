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

function loadService() {
  const base = path.resolve(__dirname, '../mother/modules/plainSpace');
  const code = fs.readFileSync(path.join(base, 'plainSpaceService.js'), 'utf8');
  function customRequire(name) {
    if (name === 'dotenv') return { config: () => {} };
    if (name === '../../emitters/motherEmitter') {
      return { onceCallback: onceWrap };
    }
    if (name.startsWith('./') || name.startsWith('../')) {
      return require(path.join(base, name));
    }
    return require(name);
  }
  const sandbox = { module: {}, exports: {}, require: customRequire, console };
  vm.runInNewContext(code, sandbox, { filename: 'plainSpaceService.js' });
  return sandbox.module.exports;
}

test('widget instance events respect permissions', async () => {
  const { registerPlainSpaceEvents } = loadService();
  const em = new EventEmitter();
  registerPlainSpaceEvents(em);

  let updates = 0;
  let selects = 0;

  em.on('dbUpdate', (payload, cb) => { updates++; cb(null, { ok: true }); });
  em.on('dbSelect', (payload, cb) => { selects++; cb(null, [{ content: 'x' }]); });

  const okJWT = { permissions: { plainspace: { widgetInstance: true } } };
  const plainSpaceScope = { jwt: 't', moduleName: 'plainspace', moduleType: 'core' };

  await new Promise((res, rej) => {
    em.emit('saveWidgetInstance', { ...plainSpaceScope, instanceId: '1', content: 'c', decodedJWT: okJWT }, err => err ? rej(err) : res());
  });
  assert.strictEqual(updates, 1);

  await new Promise(resolve => {
    em.emit('saveWidgetInstance', { ...plainSpaceScope, instanceId: '1', content: 'c', decodedJWT: {} }, err => { assert(err); resolve(); });
  });
  assert.strictEqual(updates, 1);

  await new Promise((res, rej) => {
    em.emit('getWidgetInstance', { ...plainSpaceScope, instanceId: '1', decodedJWT: okJWT }, (err, data) => err ? rej(err) : res(data));
  });
  assert.strictEqual(selects, 1);

  await new Promise(resolve => {
    em.emit('getWidgetInstance', { ...plainSpaceScope, instanceId: '1', decodedJWT: {} }, err => { assert(err); resolve(); });
  });
  assert.strictEqual(selects, 1);
});

test('plainSpace events require the plainspace core scope and emit scoped database payloads', async () => {
  const { registerPlainSpaceEvents } = loadService();
  const em = new EventEmitter();
  const dbCalls = [];
  registerPlainSpaceEvents(em);

  em.on('dbUpdate', (payload, cb) => {
    dbCalls.push(payload);
    cb(null, { ok: true });
  });

  await new Promise(resolve => {
    em.emit('saveLayoutForViewport', {
      jwt: 't',
      moduleName: 'otherCore',
      moduleType: 'core',
      pageId: 'page-1',
      lane: 'public',
      viewport: 'desktop',
      layout: []
    }, err => {
      assert(err);
      assert.match(err.message, /invalid meltdown payload/);
      resolve();
    });
  });
  assert.strictEqual(dbCalls.length, 0);

  await new Promise((resolve, reject) => {
    em.emit('saveLayoutForViewport', {
      jwt: 't',
      moduleName: 'plainspace',
      moduleType: 'core',
      pageId: 'page-1',
      lane: 'public',
      viewport: 'desktop',
      layout: []
    }, err => (err ? reject(err) : resolve()));
  });

  assert.strictEqual(dbCalls.length, 1);
  assert.strictEqual(dbCalls[0].moduleName, 'plainspace');
  assert.strictEqual(dbCalls[0].moduleType, 'core');
});
