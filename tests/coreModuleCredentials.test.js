'use strict';

const jwt = require('jsonwebtoken');
const {
  createCoreModuleCredentialProvider
} = require('../mother/server/bootstrap/coreModuleCredentials');

function signModuleToken(moduleName, issuedAtSeconds, lifetimeSeconds = 100) {
  return jwt.sign({ moduleName, trustLevel: 'high', iat: issuedAtSeconds }, 'credential-fixture', {
    expiresIn: lifetimeSeconds
  });
}

test('renews core credentials across repeated lifetimes without retaining an expired token', async () => {
  let nowMs = 1_000_000;
  let issued = 0;
  const provider = createCoreModuleCredentialProvider({
    moduleName: 'runtimeManager',
    now: () => nowMs,
    renewalLeadMs: 10_000,
    issueToken: () => signModuleToken('runtimeManager', Math.floor(nowMs / 1000), 100 + issued++)
  });

  const first = await provider.getToken();
  nowMs += 91_000;
  const second = await provider.getToken();
  nowMs += 92_000;
  const third = await provider.getToken();

  expect(new Set([first, second, third]).size).toBe(3);
  expect(issued).toBe(3);
});

test('concurrent renewal requests share one issuance and a failure is never cached as a credential', async () => {
  let release;
  const issuance = new Promise(resolve => { release = resolve; });
  const issueToken = jest.fn(() => issuance);
  const provider = createCoreModuleCredentialProvider({
    moduleName: 'pagesManager',
    now: () => 2_000_000,
    issueToken
  });

  const requests = [provider.getToken(), provider.getToken(), provider.getToken()];
  await Promise.resolve();
  expect(issueToken).toHaveBeenCalledTimes(1);
  release(signModuleToken('pagesManager', 2000));
  expect(new Set(await Promise.all(requests)).size).toBe(1);

  const failedProvider = createCoreModuleCredentialProvider({
    moduleName: 'pagesManager',
    issueToken: async () => { throw new Error('fixture issuance failure'); }
  });
  await expect(failedProvider.getToken()).rejects.toMatchObject({
    code: 'CORE_MODULE_CREDENTIAL_ISSUANCE_FAILED',
    moduleName: 'pagesManager'
  });
  expect(failedProvider.currentToken()).toBeNull();
});

test('refuses non-expiring, public, user, or wrong-subject credentials', async () => {
  const invalidTokens = [
    jwt.sign({ moduleName: 'runtimeManager', trustLevel: 'high' }, 'credential-fixture', { noTimestamp: true }),
    jwt.sign({ moduleName: 'runtimeManager', trustLevel: 'low' }, 'credential-fixture', { expiresIn: 60 }),
    jwt.sign({ moduleName: 'pagesManager', trustLevel: 'high' }, 'credential-fixture', { expiresIn: 60 }),
    jwt.sign({ moduleName: 'runtimeManager', trustLevel: 'high', isPublic: true }, 'credential-fixture', { expiresIn: 60 }),
    jwt.sign({ moduleName: 'runtimeManager', trustLevel: 'high', isUser: true, userId: 'fixture-user' }, 'credential-fixture', { expiresIn: 60 })
  ];
  for (const token of invalidTokens) {
    const provider = createCoreModuleCredentialProvider({
      moduleName: 'runtimeManager',
      issueToken: async () => token
    });
    await expect(provider.getToken()).rejects.toMatchObject({ code: 'CORE_MODULE_CREDENTIAL_INVALID' });
  }
});
