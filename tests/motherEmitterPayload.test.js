process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.TOKEN_SALT_LOW = process.env.TOKEN_SALT_LOW || '';
process.env.TOKEN_SALT_MEDIUM = process.env.TOKEN_SALT_MEDIUM || '';
process.env.TOKEN_SALT_HIGH = process.env.TOKEN_SALT_HIGH || '';

const jwt = require('jsonwebtoken');
const {
  motherEmitter,
  meltdownForModule,
  _internals
} = require('../mother/emitters/motherEmitter');

function createEmitter() {
  const Cls = motherEmitter.constructor;
  return new Cls();
}

test('emits error when moduleName is missing', done => {
  const em = createEmitter();
  em.on('dummy', (p, cb) => cb(null, true));
  em.emit('dummy', { jwt: 't' }, err => {
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/moduleName/);
    done();
  });
});

test('allows agent access public exchange events without a caller jwt', done => {
  const em = createEmitter();
  em.on('agentAccess.exchangeCode', (payload, cb) => {
    cb(null, { code: payload.code });
  });

  em.emit('agentAccess.exchangeCode', {
    moduleName: 'agentAccess',
    moduleType: 'core',
    code: 'bp_agent_test'
  }, (err, result) => {
    expect(err).toBeNull();
    expect(result).toEqual({ code: 'bp_agent_test' });
    done();
  });
});

test('blocks registered module type spoofing before dispatch', () => {
  const em = createEmitter();
  let dispatched = false;
  em.registerModuleType('communityEmitterTest', 'community');
  em.on('spoofedTypeEvent', () => {
    dispatched = true;
  });

  const result = em.emit('spoofedTypeEvent', {
    moduleName: 'communityEmitterTest',
    moduleType: 'core'
  }, () => {});

  expect(result).toBe(false);
  expect(dispatched).toBe(false);
});

test('blocks module JWT subject spoofing before dispatch', () => {
  const em = createEmitter();
  let dispatched = false;
  const token = jwt.sign({
    moduleName: 'signedEmitterModule',
    trustLevel: 'low'
  }, process.env.JWT_SECRET);

  em.on('spoofedSubjectEvent', () => {
    dispatched = true;
  });

  const result = em.emit('spoofedSubjectEvent', {
    jwt: token,
    moduleName: 'payloadEmitterModule',
    moduleType: 'community'
  }, () => {});

  expect(result).toBe(false);
  expect(dispatched).toBe(false);
});

test('blocks direct emission of internal runtime cleanup events', () => {
  const em = createEmitter();
  let dispatched = false;
  em.on('deactivateModule', () => {
    dispatched = true;
  });

  let callbackErr = null;
  const result = em.emit('deactivateModule', {
    moduleName: 'victimModule'
  }, err => {
    callbackErr = err;
  });

  expect(callbackErr).toBeInstanceOf(Error);
  expect(callbackErr.message).toMatch(/internal/);
  expect(result).toBe(false);
  expect(dispatched).toBe(false);
});

test('meltdownForModule uses internal cleanup and removes owned listeners', () => {
  const em = createEmitter();
  let deactivationPayload = null;
  em.on('deactivateModule', payload => {
    deactivationPayload = payload;
    _internals.removeListenersForModule(em, payload.moduleName);
  });

  const ownedListener = Object.assign(() => {}, { moduleName: 'cleanupTargetModule' });
  em.on('ownedEvent', ownedListener);
  expect(em.listeners('ownedEvent')).toHaveLength(1);

  meltdownForModule('boundary violation', 'cleanupTargetModule', em);

  expect(deactivationPayload).toBeTruthy();
  expect(deactivationPayload.moduleName).toBe('cleanupTargetModule');
  expect(_internals.isInternalSystemPayload(deactivationPayload)).toBe(true);
  expect(em.listeners('ownedEvent')).toHaveLength(0);
});
