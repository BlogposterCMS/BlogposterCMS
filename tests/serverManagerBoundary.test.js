'use strict';

const assert = require('assert');
const EventEmitter = require('events');
const serverManager = require('../mother/modules/serverManager');

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

function installDatabaseStubs(emitter, calls) {
  emitter.on('createDatabase', (payload, cb) => {
    calls.push({ eventName: 'createDatabase', payload });
    cb(null, { ok: true });
  });

  emitter.on('dbInsert', (payload, cb) => {
    calls.push({ eventName: 'dbInsert', payload });
    cb(null, { id: 'inserted' });
  });

  emitter.on('dbSelect', (payload, cb) => {
    calls.push({ eventName: 'dbSelect', payload });
    const rawSQL = payload?.data?.rawSQL || payload?.where?.rawSQL;
    if (rawSQL === 'SERVERMANAGER_GET_LOCATION') {
      cb(null, [{ id: payload.data.locationId, serverName: 'edge-1' }]);
      return;
    }
    cb(null, [{ id: 'srv-1', serverName: 'edge-1' }]);
  });

  emitter.on('dbUpdate', (payload, cb) => {
    calls.push({ eventName: 'dbUpdate', payload });
    cb(null, { ok: true });
  });

  emitter.on('dbDelete', (payload, cb) => {
    calls.push({ eventName: 'dbDelete', payload });
    cb(null, { ok: true });
  });
}

async function initializeServerManagerForTest() {
  const emitter = new EventEmitter();
  const calls = [];
  installDatabaseStubs(emitter, calls);
  await serverManager.initialize({
    motherEmitter: emitter,
    isCore: true,
    jwt: 'server-manager-token'
  });
  return { emitter, calls };
}

const allPermissions = {
  permissions: {
    serverManager: {
      createLocation: true,
      viewLocations: true,
      deleteLocation: true,
      editLocation: true
    }
  }
};

test('serverManager rejects unscoped caller payloads', async () => {
  const { emitter } = await initializeServerManagerForTest();
  const cases = [
    ['addServerLocation', { serverName: 'edge-1', ipAddress: '127.0.0.1' }],
    ['getServerLocation', { locationId: 'srv-1' }],
    ['listServerLocations', {}],
    ['deleteServerLocation', { locationId: 'srv-1' }],
    ['updateServerLocation', { locationId: 'srv-1', newName: 'edge-2' }]
  ];

  for (const [eventName, extra] of cases) {
    const result = await emitAsync(emitter, eventName, {
      jwt: 'other-core-token',
      moduleName: 'pagesManager',
      moduleType: 'core',
      decodedJWT: allPermissions,
      ...extra
    });

    assert(result.err, `${eventName} should reject a caller outside serverManager`);
    assert.match(result.err.message, /invalid meltdown payload/);
  }
});

test('serverManager emits scoped core database payloads', async () => {
  const { emitter, calls } = await initializeServerManagerForTest();
  const base = {
    jwt: 'server-manager-token',
    moduleName: 'serverManager',
    moduleType: 'core',
    decodedJWT: allPermissions
  };

  await emitAsync(emitter, 'addServerLocation', {
    ...base,
    serverName: 'edge-1',
    ipAddress: '127.0.0.1'
  });
  await emitAsync(emitter, 'getServerLocation', { ...base, locationId: 'srv-1' });
  await emitAsync(emitter, 'listServerLocations', base);
  await emitAsync(emitter, 'deleteServerLocation', { ...base, locationId: 'srv-1' });
  await emitAsync(emitter, 'updateServerLocation', {
    ...base,
    locationId: 'srv-1',
    newName: 'edge-2'
  });

  const runtimeDbCalls = calls.filter(({ eventName, payload }) => {
    if (!['dbInsert', 'dbSelect', 'dbUpdate', 'dbDelete'].includes(eventName)) return false;
    return payload?.data?.rawSQL !== 'INIT_SERVERMANAGER_SCHEMA';
  });

  assert.strictEqual(runtimeDbCalls.length, 5);
  runtimeDbCalls.forEach(({ payload }) => {
    assert.strictEqual(payload.moduleName, 'serverManager');
    assert.strictEqual(payload.moduleType, 'core');
    assert.strictEqual(payload.table, '__rawSQL__');
  });
});
