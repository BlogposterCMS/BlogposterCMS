'use strict';

process.env.JWT_SECRET = 'core-module-credential-test-secret';
process.env.AUTH_MODULE_INTERNAL_SECRET = 'core-module-auth-test-secret';
process.env.TOKEN_SALT_HIGH = '';
process.env.TOKEN_SALT_MEDIUM = '';
process.env.TOKEN_SALT_LOW = '';
process.env.JWT_EXPIRY_HIGH = '60s';

const jwt = require('jsonwebtoken');
const { BACKEND_EVENTS } = require('../mother/contracts/generatedBackendEventCatalog');
const { requestBackendEvent } = require('../mother/contracts/backendEventContracts');
const { motherEmitter } = require('../mother/emitters/motherEmitter');
const { setupEventListeners } = require('../mother/modules/auth/authService');
const { _internals: runtimeInternals } = require('../mother/modules/runtimeManager');
const {
  createCoreModuleCredentialProvider
} = require('../mother/server/bootstrap/coreModuleCredential');
const { createCoreModuleTokenFactory } = require('../mother/server/bootstrap/moduleBootstrap');
const { createCoreModuleScope } = require('../mother/server/bootstrap/coreModuleScope');

function unsignedFixtureToken(expiresAt) {
  return jwt.sign({ exp: Math.floor(expiresAt / 1000) }, 'fixture-only', { noTimestamp: true });
}

function createMotherEmitter() {
  return new motherEmitter.constructor();
}

test('credential cache renews once for concurrent callers and rejects unusable issuance', async () => {
  let currentTime = 1_800_000_000_000;
  let finishRenewal;
  const issueToken = jest.fn()
    .mockResolvedValueOnce(unsignedFixtureToken(currentTime + 60_000))
    .mockImplementationOnce(() => new Promise(resolve => { finishRenewal = resolve; }));
  const getCredential = createCoreModuleCredentialProvider({
    issueToken,
    now: () => currentTime,
    refreshBeforeExpiryMs: 10_000
  });

  const initial = await getCredential('runtimeManager');
  expect(getCredential('runtimeManager')).toBe(initial);
  currentTime += 51_000;
  const first = getCredential('runtimeManager');
  const second = getCredential('runtimeManager');
  expect(first).toBe(second);
  await Promise.resolve();
  expect(issueToken).toHaveBeenCalledTimes(2);
  const renewed = unsignedFixtureToken(currentTime + 60_000);
  finishRenewal(renewed);
  await expect(first).resolves.toBe(renewed);

  const invalidProvider = createCoreModuleCredentialProvider({
    issueToken: async () => 'not-a-jwt',
    now: () => currentTime
  });
  await expect(invalidProvider('runtimeManager')).rejects.toMatchObject({
    code: 'CORE_MODULE_CREDENTIAL_INVALID'
  });
  const missingProvider = createCoreModuleCredentialProvider({
    issueToken: async () => undefined,
    now: () => currentTime
  });
  await expect(missingProvider('runtimeManager')).rejects.toMatchObject({
    code: 'CORE_MODULE_CREDENTIAL_INVALID'
  });
  const expiredProvider = createCoreModuleCredentialProvider({
    issueToken: async () => unsignedFixtureToken(currentTime - 1_000),
    now: () => currentTime
  });
  await expect(expiredProvider('runtimeManager')).rejects.toMatchObject({
    code: 'CORE_MODULE_CREDENTIAL_EXPIRED'
  });
});

function runtimeHarness(now) {
  const emitter = createMotherEmitter();
  setupEventListeners({ emitter, motherEmitter: emitter, JWT_SECRET: process.env.JWT_SECRET });
  emitter.registerModuleType('runtimeManager', 'core');
  const issueModuleToken = createCoreModuleTokenFactory({
    motherEmitter: emitter,
    authModuleSecret: process.env.AUTH_MODULE_INTERNAL_SECRET
  });
  const issueToken = jest.fn(moduleName => issueModuleToken(moduleName));
  const getCredential = createCoreModuleCredentialProvider({
    issueToken,
    now,
    refreshBeforeExpiryMs: 1_000
  });
  return { emitter, getCredential, issueToken };
}

test('elapsed startup JWT is renewed through the real MotherEmitter public runtime handler', async () => {
  let currentTime = 1_800_000_000_000;
  const clock = jest.spyOn(Date, 'now').mockImplementation(() => currentTime);
  const { emitter, getCredential, issueToken } = runtimeHarness(() => currentTime);
  const seenTokens = [];
  emitter.on(BACKEND_EVENTS.GET_START_PAGE, (payload, callback) => {
    seenTokens.push(payload.jwt);
    callback(null, { id: 'home', slug: 'home', status: 'published', lane: 'public' });
  });

  try {
    const startupToken = await getCredential('runtimeManager');
    const scope = createCoreModuleScope(emitter, 'runtimeManager', {
      credential: { startupToken, getToken: () => getCredential('runtimeManager') }
    });
    runtimeInternals.setupRuntimeEvents(scope.emitter, startupToken);
    scope.activate();
    const publicToken = jwt.sign(
      { trustLevel: 'low', isPublic: true },
      process.env.JWT_SECRET,
      { expiresIn: 600 }
    );
    const payload = {
      jwt: publicToken,
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'start',
      params: {}
    };

    await expect(requestBackendEvent(emitter, BACKEND_EVENTS.CMS_PUBLIC_RUNTIME_REQUEST, { ...payload }))
      .resolves.toMatchObject({ data: { id: 'home' } });
    const expiredStartupToken = seenTokens[0];
    currentTime += 61_000;
    await expect(requestBackendEvent(emitter, BACKEND_EVENTS.CMS_PUBLIC_RUNTIME_REQUEST, { ...payload }))
      .resolves.toMatchObject({ data: { id: 'home' } });

    expect(issueToken).toHaveBeenCalledTimes(2);
    expect(seenTokens).toHaveLength(2);
    expect(seenTokens[1]).not.toBe(expiredStartupToken);
    expect(jwt.decode(seenTokens[1])).toMatchObject({ moduleName: 'runtimeManager' });
    await scope.drain();
    await scope.dispose();
  } finally {
    clock.mockRestore();
  }
});

test('denied renewal fails the public runtime request without replaying its action', async () => {
  let currentTime = 1_800_100_000_000;
  const clock = jest.spyOn(Date, 'now').mockImplementation(() => currentTime);
  const { emitter, getCredential } = runtimeHarness(() => currentTime);
  const action = jest.fn((_payload, callback) => callback(null, {
    id: 'home', slug: 'home', status: 'published', lane: 'public'
  }));
  emitter.on(BACKEND_EVENTS.GET_START_PAGE, action);

  try {
    const startupToken = await getCredential('runtimeManager');
    const scope = createCoreModuleScope(emitter, 'runtimeManager', {
      credential: { startupToken, getToken: () => getCredential('runtimeManager') }
    });
    runtimeInternals.setupRuntimeEvents(scope.emitter, startupToken);
    scope.activate();
    emitter.removeAllListeners(BACKEND_EVENTS.ISSUE_MODULE_TOKEN);
    currentTime += 61_000;
    const publicToken = jwt.sign(
      { trustLevel: 'low', isPublic: true },
      process.env.JWT_SECRET,
      { expiresIn: 600 }
    );

    await expect(requestBackendEvent(emitter, BACKEND_EVENTS.CMS_PUBLIC_RUNTIME_REQUEST, {
      jwt: publicToken,
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'start',
      params: {}
    })).rejects.toBeTruthy();
    expect(action).not.toHaveBeenCalled();
    await scope.drain();
    await scope.dispose();
  } finally {
    clock.mockRestore();
  }
});
