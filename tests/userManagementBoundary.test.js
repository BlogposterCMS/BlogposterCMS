'use strict';

const assert = require('assert');
const EventEmitter = require('events');
const { setupRoleCrudEvents } = require('../mother/modules/userManagement/roleCrudEvents');

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

function initializeRoleEventsForTest() {
  const emitter = new EventEmitter();
  const calls = [];

  emitter.on('dbSelect', (payload, cb) => {
    calls.push({ eventName: 'dbSelect', payload });
    cb(null, [{ id: payload.where.id, token_version: 4 }]);
  });

  emitter.on('dbUpdate', (payload, cb) => {
    calls.push({ eventName: 'dbUpdate', payload });
    cb(null, { ok: true });
  });

  setupRoleCrudEvents(emitter);
  return { emitter, calls };
}

test('incrementUserTokenVersion requires a scoped userManagement core payload', async () => {
  const { emitter } = initializeRoleEventsForTest();

  const wrongType = await emitAsync(emitter, 'incrementUserTokenVersion', {
    jwt: 'user-management-token',
    moduleName: 'userManagement',
    moduleType: 'community',
    userId: 7,
    decodedJWT: { permissions: { userManagement: { editUser: true } } }
  });
  assert(wrongType.err);
  assert.match(wrongType.err.message, /invalid payload/);

  const wrongModule = await emitAsync(emitter, 'incrementUserTokenVersion', {
    jwt: 'other-core-token',
    moduleName: 'auth',
    moduleType: 'core',
    userId: 7,
    decodedJWT: { permissions: { userManagement: { editUser: true } } }
  });
  assert(wrongModule.err);
  assert.match(wrongModule.err.message, /invalid payload/);
});

test('incrementUserTokenVersion emits scoped core database calls', async () => {
  const { emitter, calls } = initializeRoleEventsForTest();

  const result = await emitAsync(emitter, 'incrementUserTokenVersion', {
    jwt: 'user-management-token',
    moduleName: 'userManagement',
    moduleType: 'core',
    userId: 7,
    decodedJWT: { permissions: { userManagement: { editUser: true } } }
  });

  assert.ifError(result.err);
  assert.deepStrictEqual(result.result, { success: true });
  assert.deepStrictEqual(calls.map(call => call.eventName), ['dbSelect', 'dbUpdate']);
  calls.forEach(({ payload }) => {
    assert.strictEqual(payload.moduleName, 'userManagement');
    assert.strictEqual(payload.moduleType, 'core');
    assert.strictEqual(payload.table, 'users');
  });
  assert.strictEqual(calls[1].payload.data.token_version, 5);
});
