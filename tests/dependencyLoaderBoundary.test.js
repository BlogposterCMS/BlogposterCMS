const assert = require('assert');
const EventEmitter = require('events');

jest.mock('../mother/modules/dependencyLoader/dependencyLoaderService', () => ({
  ensureDependencyLoaderDatabase: jest.fn(() => Promise.resolve()),
  ensureDependencyLoaderSchemaAndTable: jest.fn(() => Promise.resolve()),
  loadDependencies: jest.fn(() => Promise.resolve()),
  checkAndLoadDependency: jest.fn(() => Promise.resolve(true))
}));

const dependencyService = require('../mother/modules/dependencyLoader/dependencyLoaderService');
const dependencyLoader = require('../mother/modules/dependencyLoader');

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => {
      resolve({ err, result });
    });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('dependency loader rejects unsafe dependency names', () => {
  assert.strictEqual(dependencyLoader._internals.isSafeDependencyName('adm-zip'), true);
  assert.strictEqual(dependencyLoader._internals.isSafeDependencyName('@scope/package'), true);
  assert.strictEqual(dependencyLoader._internals.isSafeDependencyName('fs'), false);
  assert.strictEqual(dependencyLoader._internals.isSafeDependencyName('node:fs'), false);
  assert.strictEqual(dependencyLoader._internals.isSafeDependencyName('../package.json'), false);
  assert.strictEqual(dependencyLoader._internals.isSafeDependencyName('left-pad/postinstall'), false);
  assert.strictEqual(dependencyLoader._internals.isSafeModuleName('demoModule'), true);
  assert.strictEqual(dependencyLoader._internals.isSafeModuleName('../demoModule'), false);
});

test('dependency loader initializer enforces and registers core scope', async () => {
  const deniedEmitter = new EventEmitter();
  await assert.rejects(
    () => dependencyLoader.initialize({ motherEmitter: deniedEmitter, isCore: false, jwtToken: 'token' }),
    /core module/
  );

  const emitter = new EventEmitter();
  emitter._moduleTypes = {};
  const registered = [];
  emitter.registerModuleType = (moduleName, moduleType) => {
    registered.push({ moduleName, moduleType });
    emitter._moduleTypes[moduleName] = moduleType;
  };

  await dependencyLoader.initialize({ motherEmitter: emitter, isCore: true, jwtToken: 'token' });

  assert.deepStrictEqual(registered, [
    { moduleName: 'dependencyLoader', moduleType: 'core' }
  ]);
  assert.strictEqual(emitter._moduleTypes.dependencyLoader, 'core');
});

test('dependency loader prevents community modules from requesting for another module', async () => {
  const emitter = new EventEmitter();
  emitter._moduleTypes = { demoModule: 'community' };
  await dependencyLoader.initialize({ motherEmitter: emitter, isCore: true, jwtToken: 'token' });

  const { err } = await emitAsync(emitter, 'requestDependency', {
    jwt: 'token',
    moduleName: 'demoModule',
    moduleType: 'community',
    moduleNameToCheck: 'otherModule',
    dependencyName: 'adm-zip'
  });

  assert(err);
  assert.match(err.message, /only request dependencies for itself/);
  assert.strictEqual(dependencyService.checkAndLoadDependency.mock.calls.length, 0);
});

test('dependency loader prevents community moduleType spoofing', async () => {
  const emitter = new EventEmitter();
  emitter._moduleTypes = { demoModule: 'community' };
  await dependencyLoader.initialize({ motherEmitter: emitter, isCore: true, jwtToken: 'token' });

  const { err } = await emitAsync(emitter, 'requestDependency', {
    jwt: 'token',
    moduleName: 'demoModule',
    moduleType: 'core',
    moduleNameToCheck: 'demoModule',
    dependencyName: 'adm-zip'
  });

  assert(err);
  assert.match(err.message, /cannot request dependencies as moduleType="core"/);
  assert.strictEqual(dependencyService.checkAndLoadDependency.mock.calls.length, 0);
});

test('dependency loader rejects unregistered dependency requesters', async () => {
  const emitter = new EventEmitter();
  emitter._moduleTypes = {};
  await dependencyLoader.initialize({ motherEmitter: emitter, isCore: true, jwtToken: 'token' });

  const { err } = await emitAsync(emitter, 'requestDependency', {
    jwt: 'token',
    moduleName: 'ghostModule',
    moduleType: 'community',
    moduleNameToCheck: 'ghostModule',
    dependencyName: 'adm-zip'
  });

  assert(err);
  assert.match(err.message, /not registered/);
  assert.strictEqual(dependencyService.checkAndLoadDependency.mock.calls.length, 0);
});

test('dependency loader rejects invalid dependency target module names', async () => {
  const emitter = new EventEmitter();
  emitter._moduleTypes = { dependencyLoader: 'core' };
  await dependencyLoader.initialize({ motherEmitter: emitter, isCore: true, jwtToken: 'token' });

  const { err } = await emitAsync(emitter, 'requestDependency', {
    jwt: 'token',
    moduleName: 'dependencyLoader',
    moduleType: 'core',
    moduleNameToCheck: '../demoModule',
    dependencyName: 'adm-zip'
  });

  assert(err);
  assert.match(err.message, /moduleNameToCheck is invalid/);
  assert.strictEqual(dependencyService.checkAndLoadDependency.mock.calls.length, 0);
});
