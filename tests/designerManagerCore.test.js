const assert = require('assert');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

class CapturingEmitter extends EventEmitter {
  constructor() {
    super();
    this.calls = [];
    this.registered = [];
  }

  registerModuleType(moduleName, moduleType) {
    this.registered.push({ moduleName, moduleType });
  }

  emit(eventName, payload, cb) {
    if (['createDatabase', 'applySchemaDefinition', 'performDbOperation'].includes(eventName)) {
      this.calls.push({ eventName, payload });
      if (typeof cb === 'function') {
        if (eventName === 'performDbOperation' && payload.operation === 'DESIGNER_LIST_DESIGNS') {
          cb(null, []);
        } else {
          cb(null, { ok: true });
        }
      }
      return true;
    }
    return super.emit(eventName, payload, cb);
  }
}

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

afterEach(() => {
  if (global.loadedModules) {
    delete global.loadedModules.designer;
  }
});

test('designer manager owns designer backend events as a core service', async () => {
  jest.resetModules();
  const designerManager = require('../mother/modules/designerManager');
  const emitter = new CapturingEmitter();

  await designerManager.initialize({
    motherEmitter: emitter,
    isCore: true,
    jwt: 'core-token',
    nonce: 'nonce-1'
  });

  assert.deepStrictEqual(emitter.registered, [
    { moduleName: 'designerManager', moduleType: 'core' },
    { moduleName: 'designer', moduleType: 'core' }
  ]);
  assert.strictEqual(emitter.listenerCount('designer.saveDesign'), 1);
  assert.strictEqual(emitter.listenerCount('designer.getDesign'), 1);
  assert.strictEqual(emitter.listenerCount('designer.listDesigns'), 1);
  assert.strictEqual(global.loadedModules.designer.handleSaveDesignPlaceholder instanceof Function, true);

  const setupEvents = emitter.calls.filter(call => call.eventName !== 'performDbOperation');
  assert.deepStrictEqual(setupEvents.map(call => call.eventName), ['createDatabase', 'applySchemaDefinition']);
  assert(setupEvents.every(call => call.payload.moduleName === 'designer'));
  assert(setupEvents.every(call => call.payload.moduleType === 'core'));

  const list = await emitAsync(emitter, 'designer.listDesigns', {});
  assert.ifError(list.err);
  assert.deepStrictEqual(list.result, { designs: [] });

  const dbCall = emitter.calls.find(call => call.eventName === 'performDbOperation');
  assert(dbCall);
  assert.strictEqual(dbCall.payload.moduleName, 'designer');
  assert.strictEqual(dbCall.payload.moduleType, 'core');
  assert.strictEqual(dbCall.payload.operation, 'DESIGNER_LIST_DESIGNS');
});

test('designer layout lookup forwards a core payload to designer.getDesign', async () => {
  jest.resetModules();
  const designerManager = require('../mother/modules/designerManager');
  const emitter = new CapturingEmitter();
  let nestedPayload;

  await designerManager.initialize({
    motherEmitter: emitter,
    isCore: true,
    jwt: 'core-token',
    nonce: 'nonce-1'
  });

  emitter.prependListener('designer.getDesign', payload => {
    nestedPayload = payload;
  });

  const layout = await emitAsync(emitter, 'designer.getLayout', {
    jwt: 'core-token',
    moduleName: 'designer',
    moduleType: 'core',
    nonce: 'nonce-1',
    layoutRef: 'layout:design-1@v1'
  });

  assert.ifError(layout.err);
  assert.strictEqual(nestedPayload.id, 'design-1');
  assert.strictEqual(nestedPayload.jwt, 'core-token');
  assert.strictEqual(nestedPayload.moduleName, 'designer');
  assert.strictEqual(nestedPayload.moduleType, 'core');
  assert.strictEqual(nestedPayload.nonce, 'nonce-1');
});

test('designer manager documents its core adapter boundary', () => {
  jest.resetModules();
  const designerManager = require('../mother/modules/designerManager');
  const infoPath = path.join(__dirname, '..', 'mother/modules/designerManager/moduleInfo.json');
  const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
  const capabilities = designerManager._internals.capabilities();

  assert.strictEqual(info.moduleName, 'designerManager');
  assert.strictEqual(info.version, designerManager.VERSION);
  assert.strictEqual(capabilities.moduleName, 'designerManager');
  assert.strictEqual(capabilities.moduleType, 'core');
  assert.strictEqual(capabilities.ownsLegacyModule, 'designer');
  assert(capabilities.events.includes('designer.saveDesign'));
  assert.strictEqual(capabilities.legacyServicePath, designerManager._internals.legacyServicePath);
});

test('designer manager refuses non-core initialization', async () => {
  jest.resetModules();
  const designerManager = require('../mother/modules/designerManager');
  const emitter = new CapturingEmitter();

  await assert.rejects(
    () => designerManager.initialize({
      motherEmitter: emitter,
      isCore: false,
      jwt: 'community-token'
    }),
    /core module/
  );
  assert.deepStrictEqual(emitter.registered, []);
});

test('legacy designer service refuses community initialization', async () => {
  jest.resetModules();
  const legacyDesigner = require('../modules/designer');
  const emitter = new CapturingEmitter();

  await assert.rejects(
    () => legacyDesigner.initialize({
      motherEmitter: emitter,
      moduleType: 'community',
      jwt: 'community-token'
    }),
    /core adapter/
  );

  await assert.rejects(
    () => legacyDesigner.initialize({
      motherEmitter: emitter,
      jwt: 'token-without-core-type'
    }),
    /core adapter/
  );

  assert.strictEqual(emitter.listenerCount('designer.saveDesign'), 0);
  assert.strictEqual(emitter.calls.length, 0);
});

test('module loader skips legacy designer folder because core owns it', () => {
  const { _internals } = require('../mother/modules/moduleLoader');
  assert.strictEqual(_internals.CORE_OWNED_OPTIONAL_MODULES.has('designer'), true);
});
