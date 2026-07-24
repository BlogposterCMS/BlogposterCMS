'use strict';

const assert = require('assert');
const EventEmitter = require('events');
const colorLibrary = require('../mother/modules/colorLibrary');
const service = require('../mother/modules/colorLibrary/colorLibraryService');
const runtimeManager = require('../mother/modules/runtimeManager');

function emitAsync(emitter, eventName, payload) {
  return new Promise((resolve, reject) => {
    emitter.emit(eventName, payload, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

function createEmitter() {
  const emitter = new EventEmitter();
  const settings = new Map();
  emitter.on('getSetting', (payload, callback) => callback(null, settings.get(payload.key) ?? null));
  emitter.on('setSetting', (payload, callback) => {
    settings.set(payload.key, payload.value);
    callback(null, { done: true });
  });
  return emitter;
}

function adminPayload(permissions) {
  return {
    jwt: 'internal-token',
    moduleName: 'colorLibrary',
    moduleType: 'core',
    decodedJWT: { permissions }
  };
}

beforeEach(() => {
  service.resetMutationQueue();
});

test('color schemes keep stable numbered Default slots while the active scheme changes', async () => {
  const emitter = createEmitter();
  await colorLibrary.initialize({ motherEmitter: emitter, isCore: true, jwt: 'internal-token' });
  const permissions = { builder: { use: true, publish: true } };

  const initial = await emitAsync(emitter, 'colorLibrary.list', adminPayload(permissions));
  assert.strictEqual(initial.version, 2);
  assert.strictEqual(initial.schemes.length, 1);
  assert.deepStrictEqual(
    initial.colors.map(color => color.id),
    ['default-1', 'default-2', 'default-3', 'default-4', 'default-5']
  );

  const createdScheme = await emitAsync(emitter, 'colorLibrary.createScheme', {
    ...adminPayload(permissions),
    name: 'Campaign',
    copyFromId: initial.activeSchemeId
  });
  assert.strictEqual(createdScheme.library.activeSchemeId, createdScheme.scheme.id);

  const updated = await emitAsync(emitter, 'colorLibrary.update', {
    ...adminPayload(permissions),
    schemeId: createdScheme.scheme.id,
    id: 'default-1',
    name: 'Campaign Primary',
    value: '#123456'
  });
  assert.strictEqual(updated.color.id, 'default-1');
  assert.strictEqual(updated.color.value, '#123456');

  const added = await emitAsync(emitter, 'colorLibrary.create', {
    ...adminPayload(permissions),
    schemeId: createdScheme.scheme.id,
    name: 'Highlight',
    value: '#06c'
  });
  assert.strictEqual(added.color.id, 'default-6');
  assert.strictEqual(added.color.value, '#0066CC');

  const removed = await emitAsync(emitter, 'colorLibrary.delete', {
    ...adminPayload(permissions),
    schemeId: createdScheme.scheme.id,
    id: 'default-6'
  });
  assert.strictEqual(removed.linkedUsesKeepFallback, true);
  assert.strictEqual(removed.library.colors.length, 5);
});

test('color schemes reject duplicate names, invalid values, unstable slot removal and unauthorized writes', async () => {
  const emitter = createEmitter();
  await colorLibrary.initialize({ motherEmitter: emitter, isCore: true, jwt: 'internal-token' });
  const publish = { builder: { use: true, publish: true } };

  await assert.rejects(
    emitAsync(emitter, 'colorLibrary.createScheme', {
      ...adminPayload(publish),
      name: 'Default'
    }),
    /COLOR_LIBRARY_SCHEME_NAME_EXISTS/
  );
  await assert.rejects(
    emitAsync(emitter, 'colorLibrary.update', {
      ...adminPayload(publish),
      id: 'default-1',
      value: 'red'
    }),
    /COLOR_LIBRARY_INVALID_VALUE/
  );
  await assert.rejects(
    emitAsync(emitter, 'colorLibrary.delete', {
      ...adminPayload(publish),
      id: 'default-1'
    }),
    /COLOR_LIBRARY_SLOT_ORDER_LOCKED/
  );
  await assert.rejects(
    emitAsync(emitter, 'colorLibrary.create', {
      ...adminPayload({ builder: { use: true } }),
      name: 'Blocked',
      value: '#123456'
    }),
    /COLOR_LIBRARY_FORBIDDEN/
  );
});

test('version 1 named colors migrate into sequential Default slots', () => {
  const migrated = service.parseStoredLibrary({
    version: 1,
    colors: [
      { id: 'legacy-a', name: 'Primary', value: '#123456' },
      { id: 'legacy-b', name: 'Background', value: '#FFFFFF' }
    ]
  });
  assert.strictEqual(migrated.version, 2);
  assert.deepStrictEqual(migrated.colors.map(color => color.id), ['default-1', 'default-2']);
  assert.strictEqual(migrated.colors[0].name, 'Primary');
});

test('runtime facade exposes bounded color scheme and public Default-slot actions', () => {
  const adminList = runtimeManager._internals.adminApiDefinition('colors', 'list');
  const createScheme = runtimeManager._internals.adminApiDefinition('colors', 'createScheme');
  const publicList = runtimeManager._internals.publicRuntimeDefinition('colors', 'list');

  assert.strictEqual(adminList.definition.eventName, 'colorLibrary.list');
  assert.strictEqual(createScheme.definition.eventName, 'colorLibrary.createScheme');
  assert.strictEqual(createScheme.definition.permission, 'builder.publish');
  assert.deepStrictEqual(publicList.definition, {
    eventName: 'colorLibrary.listPublic',
    moduleName: 'colorLibrary'
  });
});
