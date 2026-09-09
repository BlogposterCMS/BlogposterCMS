'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadCoreModuleCode } = require('../mother/server/bootstrap/coreModuleCode');
const { createCoreModuleLifecycle } = require('../mother/server/bootstrap/coreModuleLifecycle');
const { EventEmitter } = require('events');
const { BACKEND_EVENTS } = require('../mother/contracts/generatedBackendEventCatalog');

let root;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-core-code-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

function write(relativePath, source) {
  const filename = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, source);
}

test('generations have private local caches but share canonical host services', () => {
  write('host/shared.js', 'module.exports = { marker: Math.random() };');
  write('host/module/index.js', 'module.exports = {};');
  for (const version of ['old', 'new']) {
    write(`${version}/index.js`, "module.exports = { service: require('../shared'), value: require('./value'), dir: __dirname };");
    write(`${version}/value.js`, `module.exports = '${version}';`);
  }
  const load = version => loadCoreModuleCode({ moduleName: 'example', moduleDir: path.join(root, version), canonicalModuleDir: path.join(root, 'host/module') });
  const old = load('old');
  const next = load('new');
  expect(old.value).toBe('old');
  expect(next.value).toBe('new');
  expect(old.service).toBe(next.service);
  expect(next.dir).toBe(path.join(root, 'new'));
  expect(require.cache[path.join(root, 'new/index.js')]).toBeUndefined();
});

test('circular local imports and JSON stay inside the candidate generation', () => {
  write('host/index.js', 'module.exports = {};');
  write('candidate/index.js', "exports.name = 'entry'; exports.child = require('./child'); exports.info = require('./moduleInfo.json');");
  write('candidate/child.js', "module.exports = require('./index').name;");
  write('candidate/moduleInfo.json', '{"version":"2.0.0"}');
  const loaded = loadCoreModuleCode({ moduleName: 'example', moduleDir: path.join(root, 'candidate'), canonicalModuleDir: path.join(root, 'host') });
  expect(loaded).toEqual({ name: 'entry', child: 'entry', info: { version: '2.0.0' } });
});

test('missing candidate dependencies fail instead of silently loading old module code', () => {
  write('host/index.js', 'module.exports = {};');
  write('host/missing.js', 'module.exports = true;');
  write('candidate/index.js', "require('./missing');");
  expect(() => loadCoreModuleCode({ moduleName: 'example', moduleDir: path.join(root, 'candidate'), canonicalModuleDir: path.join(root, 'host') }))
    .toThrow('CORE_MODULE_CODE_MISSING');
});

test('real translation handlers switch generations without migrating again or losing the old implementation', async () => {
  const canonicalModuleDir = path.resolve(__dirname, '../mother/modules/translationManager');
  const moduleDir = path.join(root, 'translationManager');
  fs.cpSync(canonicalModuleDir, moduleDir, { recursive: true });
  const eventsFile = path.join(moduleDir, 'translationCrudEvents.js');
  const original = fs.readFileSync(eventsFile, 'utf8');
  const modified = original.replace('limit: normalizeListLimit(payload.limit, 100, 200)', 'limit: normalizeListLimit(payload.limit, 50, 200)');
  expect(modified).not.toBe(original);
  fs.writeFileSync(eventsFile, modified);
  const next = loadCoreModuleCode({ moduleName: 'translationManager', moduleDir, canonicalModuleDir });
  const emitter = new EventEmitter();
  const migrations = jest.fn((_payload, callback) => callback(null, {}));
  emitter.on(BACKEND_EVENTS.DB_UPDATE, migrations);
  emitter.on(BACKEND_EVENTS.DB_SELECT, (payload, callback) => callback(null, [payload.data.params]));
  const manager = createCoreModuleLifecycle(emitter);
  const current = require('../mother/modules/translationManager');
  await manager.start('translationManager', current, { jwt: 'test-token', isCore: true });
  const read = () => new Promise((resolve, reject) => emitter.emit(BACKEND_EVENTS.LIST_TRANSLATED_TEXTS,
    { moduleName: 'translationManager', moduleType: 'core', jwt: 'test-token' },
    (error, value) => error ? reject(error) : resolve(value)));
  expect((await read())[0].limit).toBe(100);
  await manager.replace('translationManager', next, { healthCheck: async () => {} });
  expect((await read())[0].limit).toBe(50);
  await manager.replace('translationManager', current, { healthCheck: async () => {} });
  expect((await read())[0].limit).toBe(100);
  expect(migrations).toHaveBeenCalledTimes(1);
});

test.each(['contentEngine', 'searchManager', 'workflowManager', 'exportManager'])('%s replaces its real event handlers without schema writes', async moduleName => {
  const canonicalModuleDir = path.resolve(__dirname, '../mother/modules', moduleName);
  const moduleDir = path.join(root, moduleName);
  fs.cpSync(canonicalModuleDir, moduleDir, { recursive: true });
  const emitter = new EventEmitter();
  const writeDatabase = jest.fn((_payload, callback) => callback(null, {}));
  emitter.on(BACKEND_EVENTS.CREATE_DATABASE, writeDatabase);
  emitter.on(BACKEND_EVENTS.DB_UPDATE, writeDatabase);
  emitter.on(BACKEND_EVENTS.DB_SELECT, (_payload, callback) => callback(null, []));
  const manager = createCoreModuleLifecycle(emitter);
  const old = require(canonicalModuleDir);
  await manager.start(moduleName, old, { jwt: 'test-token', isCore: true });
  const writesBeforeUpdate = writeDatabase.mock.calls.length;
  const counts = new Map(emitter.eventNames().map(event => [event, emitter.listenerCount(event)]));
  const next = loadCoreModuleCode({ moduleName, moduleDir, canonicalModuleDir });
  await manager.replace(moduleName, next, { healthCheck: (implementation, context) => implementation.healthCheck(context) });
  expect(writeDatabase).toHaveBeenCalledTimes(writesBeforeUpdate);
  expect(new Map(emitter.eventNames().map(event => [event, emitter.listenerCount(event)]))).toEqual(counts);
  expect(manager.snapshot()[0]).toMatchObject({ state: 'active', updateMode: 'module', pending: 0 });
});
