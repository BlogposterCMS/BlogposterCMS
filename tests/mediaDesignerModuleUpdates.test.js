'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { EventEmitter } = require('events');
const crypto = require('crypto');
const { createCoreModuleLifecycle } = require('../mother/server/bootstrap/coreModuleLifecycle');
const { loadCoreModuleCode } = require('../mother/server/bootstrap/coreModuleCode');

class DatabaseEmitter extends EventEmitter {
  constructor() { super(); this.calls = []; }
  registerModuleType() {}
  emit(event, payload, callback) {
    if (event === 'getSetting') { this.calls.push({ event, payload }); callback(null, null); return true; }
    if (['createDatabase', 'applySchemaDefinition', 'dbUpdate', 'dbSelect', 'performDbOperation'].includes(event)) {
      this.calls.push({ event, payload });
      callback(null, ['dbSelect', 'performDbOperation'].includes(event) ? [] : { ok: true });
      return true;
    }
    return super.emit(event, payload, callback);
  }
}

let directory;
let originalCwd;
let previousModules;
const keyNames = ['APP_FRAME_ORIGIN_TOKEN_PRIVATE_KEY', 'APP_FRAME_ORIGIN_TOKEN_PUBLIC_KEY'];
const previousKeys = keyNames.map(name => process.env[name]);
beforeAll(() => {
  const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env[keyNames[0]] = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  process.env[keyNames[1]] = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
});
afterAll(() => keyNames.forEach((name, index) => {
  if (previousKeys[index] === undefined) delete process.env[name]; else process.env[name] = previousKeys[index];
}));
beforeEach(() => {
  originalCwd = process.cwd(); previousModules = global.loadedModules;
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-owned-module-'));
  fs.mkdirSync(path.join(directory, 'library'));
  process.chdir(directory);
});
afterEach(() => {
  process.chdir(originalCwd); global.loadedModules = previousModules;
  fs.rmSync(directory, { recursive: true, force: true });
});

test.each(['mediaManager', 'designerManager', 'metadataManager', 'commentsManager', 'navigationManager', 'seoManager', 'redirectManager', 'colorLibrary', 'fontPackages', 'sitePresets', 'settingsManager', 'dependencyLoader', 'serverManager', 'appLoader', 'widgetManager', 'shareManager', 'runtimeManager'])('%s replaces real handlers without repeating schema work or shared registration', async moduleName => {
  const canonicalModuleDir = path.resolve(__dirname, '../mother/modules', moduleName);
  const moduleDir = path.join(directory, moduleName);
  fs.cpSync(canonicalModuleDir, moduleDir, { recursive: true });
  const emitter = new DatabaseEmitter();
  const lifecycle = createCoreModuleLifecycle(emitter);
  const implementation = require(canonicalModuleDir);
  const context = { app: express(), isCore: true, jwt: 'test-core-token' };
  await lifecycle.start(moduleName, implementation, context);
  const sharedDesigner = global.loadedModules?.designerManager;
  emitter.calls.length = 0;
  const next = loadCoreModuleCode({ moduleName, moduleDir, canonicalModuleDir });
  await lifecycle.replace(moduleName, next, { healthCheck: (candidate, candidateContext) => candidate.healthCheck(candidateContext) });
  expect(emitter.calls.length).toBeGreaterThan(0);
  expect(emitter.calls.every(call => ['dbSelect', 'performDbOperation', 'getSetting'].includes(call.event))).toBe(true);
  expect(global.loadedModules?.designerManager).toBe(sharedDesigner);
  expect(lifecycle.snapshot()[0]).toMatchObject({ state: 'active', recoveryRequired: false });
});

test.each(['agentAccess', 'unifiedSettings'])('%s retains host state through replacement and rollback', async moduleName => {
  const canonicalModuleDir = path.resolve(__dirname, '../mother/modules', moduleName);
  const moduleDir = path.join(directory, moduleName);
  fs.cpSync(canonicalModuleDir, moduleDir, { recursive: true });
  const current = require(canonicalModuleDir);
  const next = loadCoreModuleCode({ moduleName, moduleDir, canonicalModuleDir });
  const emitter = new DatabaseEmitter();
  const lifecycle = createCoreModuleLifecycle(emitter);
  await lifecycle.start(moduleName, current, { isCore: true, jwt: 'test-core-token' });
  const record = { marker: 'registration-before-update' };
  if (moduleName === 'agentAccess') current._internals.accessCodes.set('pending-code', record);
  else current._internals.registerSchema('testModule', record);
  const counts = () => emitter.eventNames().map(event => [event, emitter.listenerCount(event)]).sort();
  const before = counts();
  const healthCheck = (candidate, context) => candidate.healthCheck(context);
  try {
    await lifecycle.replace(moduleName, next, { healthCheck });
    expect(counts()).toEqual(before);
    if (moduleName === 'agentAccess') {
      expect(next._internals.accessCodes).toBe(current._internals.accessCodes);
      expect(next._internals.accessCodes.get('pending-code')).toBe(record);
    } else {
      const registered = next._internals.registerSchema('secondModule', record);
      expect(require('../mother/modules/unifiedSettings/settingsRegistryService').retrieveSchemaForModule('secondModule')).toBe(registered);
    }
    await lifecycle.replace(moduleName, current, { healthCheck });
    expect(counts()).toEqual(before);
  } finally {
    if (moduleName === 'agentAccess') current._internals.resetForTests();
    else current._internals.resetRegistry();
  }
});

test('a persisted Designer generation boots with the canonical schema path', async () => {
  const canonicalModuleDir = path.resolve(__dirname, '../mother/modules/designerManager');
  const moduleDir = path.join(directory, 'persisted-designer');
  fs.cpSync(canonicalModuleDir, moduleDir, { recursive: true });
  const implementation = loadCoreModuleCode({ moduleName: 'designerManager', moduleDir, canonicalModuleDir });
  const emitter = new DatabaseEmitter();
  await createCoreModuleLifecycle(emitter).start('designerManager', implementation, { isCore: true, jwt: 'test-core-token' });
  const schema = emitter.calls.find(call => call.event === 'applySchemaDefinition');
  expect(schema.payload.filePath).toBe(path.join(canonicalModuleDir, 'schemaDefinition.json'));
});

test('importer replaces its mapping code while retaining canonical staging roots', async () => {
  const canonicalModuleDir = path.resolve(__dirname, '../mother/modules/importer');
  const moduleDir = path.join(directory, 'importer');
  fs.cpSync(canonicalModuleDir, moduleDir, { recursive: true });
  const mapping = path.join(moduleDir, 'importers/hotUpdateProbe.js');
  fs.writeFileSync(mapping, "module.exports = { name: 'update-probe', import: async () => ({ version: 'candidate' }) };");
  const current = require(canonicalModuleDir);
  const next = loadCoreModuleCode({ moduleName: 'importer', moduleDir, canonicalModuleDir });
  const emitter = new DatabaseEmitter();
  const lifecycle = createCoreModuleLifecycle(emitter);
  const payload = { isCore: true, jwt: 'test-token', moduleName: 'importer', moduleType: 'core' };
  const emit = (event, extra = {}) => new Promise((resolve, reject) => emitter.emit(event, { ...payload, ...extra }, (error, value) => error ? reject(error) : resolve(value)));
  await lifecycle.start('importer', current, payload);
  await lifecycle.replace('importer', next, { healthCheck: (candidate, context) => candidate.healthCheck(context) });
  expect(await emit('listImporters')).toContain('update-probe');
  expect(await emit('runImport', { importerName: 'update-probe' })).toEqual({ version: 'candidate' });
  await expect(emit('runImport', { importerName: 'wordpress', options: { filePath: path.join(moduleDir, 'private.xml') } })).rejects.toThrow('import staging root');
});

test('share updates wait for database work even after the caller timeout', async () => {
  const canonicalModuleDir = path.resolve(__dirname, '../mother/modules/shareManager');
  const moduleDir = path.join(directory, 'shareManager');
  fs.cpSync(canonicalModuleDir, moduleDir, { recursive: true });
  const entry = path.join(moduleDir, 'index.js');
  fs.writeFileSync(entry, fs.readFileSync(entry, 'utf8').replace('TIMEOUT_DURATION = 5000', 'TIMEOUT_DURATION = 5'));
  const current = loadCoreModuleCode({ moduleName: 'shareManager', moduleDir, canonicalModuleDir });
  const emitter = new DatabaseEmitter();
  let completeInsert;
  emitter.on('dbInsert', (_payload, callback) => { completeInsert = callback; });
  const lifecycle = createCoreModuleLifecycle(emitter);
  await lifecycle.start('shareManager', current, { isCore: true, jwt: 'test-token' });
  const reply = jest.fn();
  emitter.emit('createShareLink', { jwt: 'test-token', moduleName: 'shareManager', moduleType: 'core', userId: 'test', filePath: 'example.txt' }, reply);
  await new Promise(resolve => setTimeout(resolve, 15));
  expect(reply).toHaveBeenCalledTimes(1);
  expect(reply.mock.calls[0][0].message).toContain('Timeout');
  expect(lifecycle.snapshot()[0].pending).toBe(1);
  const replacement = lifecycle.replace('shareManager', require(canonicalModuleDir), { healthCheck: (candidate, context) => candidate.healthCheck(context) });
  completeInsert(null, {});
  await replacement;
  expect(reply).toHaveBeenCalledTimes(1);
  expect(lifecycle.snapshot()[0].pending).toBe(0);
});

test('PlainSpace replacement preserves public tokens and does not reseed registries', async () => {
  const canonicalModuleDir = path.resolve(__dirname, '../mother/modules/plainSpace');
  const moduleDir = path.join(directory, 'plainSpace');
  fs.cpSync(canonicalModuleDir, moduleDir, { recursive: true });
  const current = require(canonicalModuleDir);
  const next = loadCoreModuleCode({ moduleName: 'plainSpace', moduleDir, canonicalModuleDir });
  const emitter = new DatabaseEmitter();
  const lifecycle = createCoreModuleLifecycle(emitter);
  const token = global.plainspacePublicToken;
  try {
    global.plainspacePublicToken = 'existing-test-public-token';
    // Seed work has already happened at host startup; exercise the real handlers.
    await lifecycle.start('plainSpace', { ...current, initialize: context => current.initialize({ ...context, isModuleUpdate: true }) }, { isCore: true, jwt: 'test-token' });
    await lifecycle.replace('plainSpace', next, { healthCheck: (candidate, context) => candidate.healthCheck(context) });
    expect(emitter.calls.every(call => call.event === 'dbSelect')).toBe(true);
    expect(global.plainspacePublicToken).toBe('existing-test-public-token');
  } finally { global.plainspacePublicToken = token; }
});

test.each(['pagesManager', 'userManagement'])('%s updates existing handlers without seeding or token rotation', async moduleName => {
  const canonicalModuleDir = path.resolve(__dirname, '../mother/modules', moduleName);
  const moduleDir = path.join(directory, moduleName);
  fs.cpSync(canonicalModuleDir, moduleDir, { recursive: true });
  const current = require(canonicalModuleDir);
  const next = loadCoreModuleCode({ moduleName, moduleDir, canonicalModuleDir });
  const emitter = new DatabaseEmitter();
  const lifecycle = createCoreModuleLifecycle(emitter);
  await lifecycle.start(moduleName, { ...current, initialize: context => current.initialize({ ...context, isModuleUpdate: true }) }, { isCore: true, jwt: 'test-token' });
  await lifecycle.replace(moduleName, next, { healthCheck: (candidate, context) => candidate.healthCheck(context) });
  expect(emitter.calls.length).toBeGreaterThan(0);
  expect(emitter.calls.every(call => call.event === 'dbSelect')).toBe(true);
  expect(lifecycle.snapshot()[0]).toMatchObject({ state: 'active', recoveryRequired: false });
});

test('analytics replacement and rejected candidates preserve the shared observation queue', async () => {
  const canonicalModuleDir = path.resolve(__dirname, '../mother/modules/analyticsManager');
  const moduleDir = path.join(directory, 'analyticsManager');
  fs.cpSync(canonicalModuleDir, moduleDir, { recursive: true });
  const current = require(canonicalModuleDir);
  const next = loadCoreModuleCode({ moduleName: 'analyticsManager', moduleDir, canonicalModuleDir });
  const collector = require('../mother/modules/analyticsManager/collector');
  const emitter = new DatabaseEmitter();
  const lifecycle = createCoreModuleLifecycle(emitter);
  await lifecycle.start('analyticsManager', current, { isCore: true, jwt: 'test-token' });
  try {
    collector.record({ kind: 'system', event: 'test-observation' });
    const queued = collector.health().queued;
    await expect(lifecycle.replace('analyticsManager', next, { healthCheck: async () => { throw new Error('readiness rejected'); } })).rejects.toThrow('readiness rejected');
    expect(collector.health()).toMatchObject({ enabled: true, queued });
    emitter.calls.length = 0;
    await lifecycle.replace('analyticsManager', next, { healthCheck: (candidate, context) => candidate.healthCheck(context) });
    expect(collector.health()).toMatchObject({ enabled: true, queued });
    expect(emitter.calls.every(call => call.event === 'dbSelect')).toBe(true);
  } finally { await current.shutdown(); }
});

test('AgentManager retains pending commands and snapshots across a generation change', async () => {
  const canonicalModuleDir = path.resolve(__dirname, '../mother/modules/agentManager');
  const moduleDir = path.join(directory, 'agentManager');
  fs.cpSync(canonicalModuleDir, moduleDir, { recursive: true });
  const current = require(canonicalModuleDir);
  const next = loadCoreModuleCode({ moduleName: 'agentManager', moduleDir, canonicalModuleDir });
  const emitter = new DatabaseEmitter();
  const lifecycle = createCoreModuleLifecycle(emitter);
  const state = current._internals;
  const key = 'test:hot-update';
  const command = { id: 'waiting-command', status: 'pending' };
  state.surfaceCommands.set(key, [command]);
  state.surfaceSnapshots.set(key, { revision: 'before-update' });
  try {
    await lifecycle.start('agentManager', current, { isCore: true, jwt: 'test-token' });
    await lifecycle.replace('agentManager', next, { healthCheck: (candidate, context) => candidate.healthCheck(context) });
    expect(next._internals.surfaceCommands.get(key)[0]).toBe(command);
    expect(next._internals.surfaceSnapshots).toBe(state.surfaceSnapshots);
    expect(next._internals.activityEvents).toBe(state.activityEvents);
  } finally { state.surfaceCommands.delete(key); state.surfaceSnapshots.delete(key); }
});

test('databaseManager uses canonical engines and only a read probe while replacing bridges', async () => {
  const canonicalModuleDir = path.resolve(__dirname, '../mother/modules/databaseManager');
  const moduleDir = path.join(directory, 'databaseManager');
  fs.cpSync(canonicalModuleDir, moduleDir, { recursive: true });
  const factory = require('../mother/modules/databaseManager/engines/engineFactory');
  const engine = { performSqliteOperation: jest.fn(async () => [{ healthy: 1 }]) };
  const mockedEngine = jest.spyOn(factory, 'getEngine').mockReturnValue(engine);
  const dbType = jest.spyOn(require('../mother/modules/databaseManager/helpers/dbTypeHelpers'), 'getDbType').mockReturnValue('sqlite');
  try {
    const current = loadCoreModuleCode({ moduleName: 'databaseManager', moduleDir, canonicalModuleDir });
    const next = loadCoreModuleCode({ moduleName: 'databaseManager', moduleDir, canonicalModuleDir });
    const emitter = new DatabaseEmitter();
    const lifecycle = createCoreModuleLifecycle(emitter);
    await lifecycle.start('databaseManager', { ...current, initialize: context => current.initialize({ ...context, isModuleUpdate: true }) }, { isCore: true, jwt: 'test-token' });
    await lifecycle.replace('databaseManager', next, { healthCheck: (candidate, context) => candidate.healthCheck(context) });
    expect(engine.performSqliteOperation).toHaveBeenCalledWith('databaseManager', 'SELECT 1', [], false);
    expect(emitter.calls).toEqual([]);
    // After both Database and Designer updates, cold-start schema requests must
    // still use the canonical allowlist rather than the database package folder.
    await new Promise((resolve, reject) => EventEmitter.prototype.emit.call(emitter, 'applySchemaDefinition', {
      jwt: 'test-token', moduleName: 'designerManager', moduleType: 'core',
      filePath: path.resolve(canonicalModuleDir, '../designerManager/schemaDefinition.json')
    }, (error, value) => error ? reject(error) : resolve(value)));
    expect(engine.performSqliteOperation).toHaveBeenCalledWith('designerManager', expect.any(String), [], expect.any(Boolean));
  } finally { mockedEngine.mockRestore(); dbType.mockRestore(); }
});

test('the updater can replace its own review handlers while retaining the active update service', async () => {
  const canonicalModuleDir = path.resolve(__dirname, '../mother/modules/updater');
  const moduleDir = path.join(directory, 'updater');
  fs.cpSync(canonicalModuleDir, moduleDir, { recursive: true });
  const current = require(canonicalModuleDir);
  const next = loadCoreModuleCode({ moduleName: 'updater', moduleDir, canonicalModuleDir });
  const coreModuleUpdates = { snapshot: jest.fn(() => ({ modules: [] })) };
  const lifecycle = createCoreModuleLifecycle(new DatabaseEmitter());
  // The existing host scheduler is already running; replacement must not add one.
  await lifecycle.start('updater', { ...current, initialize: context => current.initialize({ ...context, isModuleUpdate: true }) }, { isCore: true, jwt: 'test-token', coreModuleUpdates });
  await lifecycle.replace('updater', next, { healthCheck: (candidate, context) => candidate.healthCheck(context) });
  expect(coreModuleUpdates.snapshot).toHaveBeenCalledTimes(1);
});

test('Auth keeps enabled login strategy instances across a handler update', async () => {
  const canonicalModuleDir = path.resolve(__dirname, '../mother/modules/auth');
  const moduleDir = path.join(directory, 'auth');
  fs.cpSync(canonicalModuleDir, moduleDir, { recursive: true });
  const previousStrategies = global.loginStrategies;
  const previousSecret = process.env.AUTH_MODULE_INTERNAL_SECRET;
  process.env.AUTH_MODULE_INTERNAL_SECRET = 'test-internal-secret';
  const strategies = { adminLocal: { isEnabled: true, loginFunction: jest.fn() } };
  global.loginStrategies = strategies;
  try {
    const current = require(canonicalModuleDir);
    const next = loadCoreModuleCode({ moduleName: 'auth', moduleDir, canonicalModuleDir });
    const lifecycle = createCoreModuleLifecycle(new DatabaseEmitter());
    await lifecycle.start('auth', { ...current, initialize: context => current.initialize({ ...context, isModuleUpdate: true }) }, { isCore: true, JWT_SECRET: 'test-signing-key', authModuleSecret: 'test-internal-secret' });
    await lifecycle.replace('auth', next, { healthCheck: (candidate, context) => candidate.healthCheck(context) });
    expect(global.loginStrategies).toBe(strategies);
    expect(strategies.adminLocal.isEnabled).toBe(true);
    expect(strategies.adminLocal.loginFunction).not.toHaveBeenCalled();
  } finally {
    global.loginStrategies = previousStrategies;
    if (previousSecret === undefined) delete process.env.AUTH_MODULE_INTERNAL_SECRET;
    else process.env.AUTH_MODULE_INTERNAL_SECRET = previousSecret;
  }
});

test('font updates wait for acknowledged provider work and preserve loaded fonts', async () => {
  const canonicalModuleDir = path.resolve(__dirname, '../mother/modules/fontsManager');
  const moduleDir = path.join(directory, 'fontsManager');
  fs.cpSync(canonicalModuleDir, moduleDir, { recursive: true });
  const previousProviders = global.fontProviders, previousFonts = global.fontsList;
  let finish;
  global.fontProviders = { test: { isEnabled: false, initFunction: () => new Promise(resolve => { finish = resolve; }) } };
  const fonts = global.fontsList = [{ name: 'Existing font' }];
  try {
    const current = require(canonicalModuleDir);
    const next = loadCoreModuleCode({ moduleName: 'fontsManager', moduleDir, canonicalModuleDir });
    const emitter = new DatabaseEmitter();
    const lifecycle = createCoreModuleLifecycle(emitter);
    await lifecycle.start('fontsManager', { ...current, initialize: context => current.initialize({ ...context, isModuleUpdate: true }) }, { isCore: true, jwt: 'test-token' });
    const acknowledged = jest.fn();
    emitter.emit('setFontProviderEnabled', { moduleName: 'fontsManager', moduleType: 'core', jwt: 'test-token', providerName: 'test', enabled: true }, acknowledged);
    expect(acknowledged).toHaveBeenCalledWith(null, { success: true });
    expect(lifecycle.snapshot()[0].pending).toBe(1);
    const replacing = lifecycle.replace('fontsManager', next, { healthCheck: (candidate, context) => candidate.healthCheck(context) });
    finish();
    await replacing;
    expect(global.fontsList).toBe(fonts);
    expect(global.fontProviders.test.isEnabled).toBe(true);
  } finally { global.fontProviders = previousProviders; global.fontsList = previousFonts; }
});

test('notification reader updates neither restart delivery nor rewrite its registry', async () => {
  const canonicalModuleDir = path.resolve(__dirname, '../mother/modules/notificationManager');
  const moduleDir = path.join(directory, 'notificationManager');
  fs.cpSync(canonicalModuleDir, moduleDir, { recursive: true });
  const notificationStateDir = path.join(directory, 'notification-state');
  fs.mkdirSync(notificationStateDir);
  const registry = path.join(notificationStateDir, 'integrationsRegistry.json');
  fs.writeFileSync(registry, '{}');
  const modified = fs.statSync(registry).mtimeMs;
  const notificationEmitter = require('../mother/emitters/notificationEmitter');
  const listeners = notificationEmitter.listenerCount('notify');
  const current = require(canonicalModuleDir);
  const next = loadCoreModuleCode({ moduleName: 'notificationManager', moduleDir, canonicalModuleDir });
  const lifecycle = createCoreModuleLifecycle(new DatabaseEmitter());
  await lifecycle.start('notificationManager', { ...current, initialize: context => current.initialize({ ...context, isModuleUpdate: true }) }, { isCore: true, jwt: 'test-token', notificationStateDir });
  await lifecycle.replace('notificationManager', next, { healthCheck: (candidate, context) => candidate.healthCheck(context) });
  expect(notificationEmitter.listenerCount('notify')).toBe(listeners);
  expect(fs.statSync(registry).mtimeMs).toBe(modified);
});

test('every CMS module and canonical bundled widget has an individual package policy', () => {
  const { MODULE_POLICY } = require('../mother/modules/updater/coreModulePackages');
  const modules = require('../mother/server/bootstrap/coreModules').coreModulesForApp({});
  const startedModules = ['auth', ...modules.map(module => module.name)];
  // Check both directions: a published package must also have a running lifecycle.
  expect(Object.entries(MODULE_POLICY).filter(([, policy]) => policy.kind !== 'widget').map(([name]) => name).sort()).toEqual([...startedModules].sort());
  for (const name of startedModules) {
    expect(MODULE_POLICY[name]).toBeDefined();
    expect(require(path.resolve(__dirname, '../mother/modules', name)).lifecycleVersion).toBe(1);
  }
  const widgets = require('../mother/modules/plainSpace/config/defaultWidgets').DEFAULT_WIDGETS;
  expect(Object.values(MODULE_POLICY).filter(policy => policy.kind === 'widget')).toHaveLength(widgets.length);
});
