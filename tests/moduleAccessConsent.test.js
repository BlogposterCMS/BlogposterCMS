const fs = require('fs');
const path = require('path');
const {
  ModuleAccessConsentManager,
  assertCanApproveRequest,
  summarizePayload,
  _internals
} = require('../mother/modules/moduleLoader/moduleAccessConsent');

test('module access policy resolves grants from the runtime admin facade', () => {
  const policySource = fs.readFileSync(
    path.join(__dirname, '../mother/modules/moduleLoader/moduleAccessPolicy.js'),
    'utf8'
  );

  expect(policySource).toContain('adminApiEventDefinition');
  expect(policySource).not.toContain('HttpFacadeAction');
});

test('module access consent builds grantable runtime requests from core events', () => {
  const request = _internals.buildRequest({
    moduleName: 'shopSync',
    moduleInfo: {
      requestedAccess: [
        { resource: 'content', action: 'list', reason: 'Read catalog entries', risk: 'low' }
      ]
    },
    eventName: 'listContentEntries',
    eventPayload: {
      jwt: 'module-token',
      limit: 20
    }
  });

  expect(request).toMatchObject({
    moduleName: 'shopSync',
    event: 'listContentEntries',
    resource: 'content',
    action: 'list',
    targetModuleName: 'contentEngine',
    targetModuleType: 'core',
    permission: 'content.update',
    reason: 'Read catalog entries',
    risk: 'low',
    protected: false,
    allowPermanent: true,
    payloadSummary: { limit: 20 },
    status: 'pending'
  });
});

test('module access consent allows protected core events only as one-time requests', () => {
  const request = _internals.buildRequest({
    moduleName: 'shopSync',
    moduleInfo: { requestedAccess: [] },
    eventName: 'deleteUser',
    eventPayload: {
      userId: 'user-1',
      jwt: 'module-token',
      password: 'secret'
    }
  });

  expect(request).toMatchObject({
    moduleName: 'shopSync',
    event: 'deleteUser',
    resource: 'users',
    action: 'delete',
    targetModuleName: 'userManagement',
    permission: 'users.delete',
    protected: true,
    allowPermanent: false,
    payloadSummary: { userId: 'user-1' }
  });
});

test('module access consent approval requires access management and target permission', () => {
  const request = {
    permission: 'users.delete'
  };

  expect(() => assertCanApproveRequest({
    permissions: { modules: { manageAccess: true } }
  }, request)).toThrow(/users\.delete/);

  expect(() => assertCanApproveRequest({
    permissions: {
      modules: { manageAccess: true },
      users: { delete: true }
    }
  }, request)).not.toThrow();
});

test('module access consent manager resolves one pending request once', async () => {
  const manager = new ModuleAccessConsentManager({ timeoutMs: 5000 });
  const { request, promise } = manager.requestAccess({
    moduleName: 'shopSync',
    moduleInfo: {},
    eventName: 'deleteUser',
    eventPayload: { userId: 'user-1' }
  });

  expect(manager.listPendingRequests()).toHaveLength(1);
  const resolved = manager.resolveRequest(request.id, {
    approved: true,
    mode: 'once',
    jwt: 'admin-token',
    decodedJWT: { userId: 'admin-1' },
    grantedBy: 'admin-1'
  });

  await expect(promise).resolves.toMatchObject({
    approved: true,
    mode: 'once',
    jwt: 'admin-token',
    decodedJWT: { userId: 'admin-1' }
  });
  expect(resolved.status).toBe('approved');
  expect(manager.listPendingRequests()).toHaveLength(0);
  expect(() => manager.resolveRequest(request.id, { approved: false })).toThrow(/not pending/);
});

test('module access consent redacts sensitive payload fields', () => {
  expect(summarizePayload({
    jwt: 'secret-token',
    decodedJWT: { userId: 'admin-1' },
    nested: {
      password: 'secret',
      title: 'Visible'
    }
  })).toEqual({
    nested: {
      password: '[redacted]',
      title: 'Visible'
    }
  });
});
