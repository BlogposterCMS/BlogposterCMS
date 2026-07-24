'use strict';

const assert = require('assert');
const EventEmitter = require('events');
const fontPackages = require('../mother/modules/fontPackages');
const service = require('../mother/modules/fontPackages/fontPackagesService');
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
  let stored = null;
  emitter.on('getSetting', (payload, callback) => {
    assert.strictEqual(payload.key, service.FONT_PACKAGES_STORAGE_KEY);
    callback(null, stored);
  });
  emitter.on('setSetting', (payload, callback) => {
    assert.strictEqual(payload.key, service.FONT_PACKAGES_STORAGE_KEY);
    stored = payload.value;
    callback(null, { done: true });
  });
  return emitter;
}

function adminPayload(permissions) {
  return {
    jwt: 'internal-token',
    moduleName: 'fontPackages',
    moduleType: 'core',
    decodedJWT: { permissions }
  };
}

beforeEach(() => {
  service.resetMutationQueue();
});

test('font packages create named copies and define all semantic text roles', async () => {
  const emitter = createEmitter();
  await fontPackages.initialize({
    motherEmitter: emitter,
    isCore: true,
    jwt: 'internal-token'
  });
  const permissions = { builder: { use: true, publish: true } };

  const initial = await emitAsync(emitter, 'fontPackages.list', adminPayload(permissions));
  assert.strictEqual(initial.packages.length, 1);
  assert.strictEqual(initial.activePackageId, service.DEFAULT_PACKAGE_ID);
  assert.deepStrictEqual(Object.keys(initial.packages[0].roles), service.ROLE_NAMES);

  const created = await emitAsync(emitter, 'fontPackages.create', {
    ...adminPayload(permissions),
    name: 'Editorial'
  });
  assert.match(created.package.id, /^[a-z0-9-]+$/);
  assert.strictEqual(created.package.name, 'Editorial');
  assert.strictEqual(created.library.activePackageId, created.package.id);

  const updated = await emitAsync(emitter, 'fontPackages.updateRole', {
    ...adminPayload(permissions),
    id: created.package.id,
    role: 'h1',
    settings: {
      fontFamily: 'Sora',
      fontSize: '56px',
      color: 'var(--bp-color-11111111-2222-4333-8444-555555555555, #123456)'
    }
  });
  assert.strictEqual(updated.package.roles.h1.fontFamily, 'Sora');
  assert.strictEqual(updated.package.roles.h1.fontSize, '56px');
  assert.strictEqual(
    updated.package.roles.h1.color,
    'var(--bp-color-11111111-2222-4333-8444-555555555555, #123456)'
  );
  assert.strictEqual(updated.package.roles.h1.fontWeight, created.package.roles.h1.fontWeight);

  const publicPackage = await emitAsync(emitter, 'fontPackages.getPublic', {
    jwt: 'public-token',
    moduleName: 'fontPackages',
    moduleType: 'core'
  });
  assert.strictEqual(publicPackage.activePackage.id, created.package.id);
  assert.strictEqual(publicPackage.activePackage.roles.h1.fontFamily, 'Sora');

  const reset = await emitAsync(emitter, 'fontPackages.resetRole', {
    ...adminPayload(permissions),
    id: created.package.id,
    role: 'h1'
  });
  assert.deepStrictEqual(reset.package.roles.h1, service.DEFAULT_ROLE_STYLES.h1);
});

test('font packages reject CSS injection, duplicate names and unauthorized mutations', async () => {
  const emitter = createEmitter();
  await fontPackages.initialize({
    motherEmitter: emitter,
    isCore: true,
    jwt: 'internal-token'
  });
  const publish = { builder: { use: true, publish: true } };

  const created = await emitAsync(emitter, 'fontPackages.create', {
    ...adminPayload(publish),
    name: 'Brand'
  });

  await assert.rejects(
    emitAsync(emitter, 'fontPackages.create', {
      ...adminPayload(publish),
      name: ' brand '
    }),
    /FONT_PACKAGES_NAME_EXISTS/
  );
  await assert.rejects(
    emitAsync(emitter, 'fontPackages.updateRole', {
      ...adminPayload(publish),
      id: created.package.id,
      role: 'body',
      settings: { fontFamily: 'Inter; color: red' }
    }),
    /FONT_PACKAGES_INVALID_FONT_FAMILY/
  );
  await assert.rejects(
    emitAsync(emitter, 'fontPackages.activate', {
      ...adminPayload({ builder: { use: true } }),
      id: created.package.id
    }),
    /FONT_PACKAGES_FORBIDDEN/
  );
});

test('runtime facade exposes bounded font package actions', () => {
  const adminList = runtimeManager._internals.adminApiDefinition('fontPackages', 'list');
  const adminRole = runtimeManager._internals.adminApiDefinition('fontPackages', 'updateRole');
  const publicActive = runtimeManager._internals.publicRuntimeDefinition('fontPackages', 'active');

  assert.deepStrictEqual(adminList.definition, {
    eventName: 'fontPackages.list',
    moduleName: 'fontPackages',
    permission: 'builder.use'
  });
  assert.deepStrictEqual(adminRole.definition, {
    eventName: 'fontPackages.updateRole',
    moduleName: 'fontPackages',
    permission: 'builder.publish'
  });
  assert.deepStrictEqual(publicActive.definition, {
    eventName: 'fontPackages.getPublic',
    moduleName: 'fontPackages'
  });
});
