const assert = require('assert');
const {
  DEFAULT_PERMISSION_DEFINITIONS,
  ensureDefaultPermissions,
  ensureDefaultRoles,
  makeAdminPermissionBlob,
  parsePermissionBlob
} = require('../mother/modules/userManagement/userInitService');
const { hasPermission } = require('../mother/modules/userManagement/permissionUtils');

class PermissionMockEmitter {
  constructor(existing = []) {
    this.existing = existing;
    this.inserted = [];
  }

  emit(event, payload, cb) {
    if (event === 'dbSelect' && payload.table === 'permissions') {
      cb(null, this.existing);
      return;
    }
    if (event === 'dbInsert' && payload.table === 'permissions') {
      this.inserted.push(payload.data);
      cb(null, {});
      return;
    }
    cb(null, {});
  }
}

class RoleMockEmitter {
  constructor(existing = []) {
    this.existing = existing;
    this.inserted = [];
    this.updated = [];
  }

  emit(event, payload, cb) {
    if (event === 'dbSelect' && payload.table === 'roles') {
      cb(null, this.existing);
      return;
    }
    if (event === 'dbInsert' && payload.table === 'roles') {
      this.inserted.push(payload.data);
      cb(null, {});
      return;
    }
    if (event === 'dbUpdate' && payload.table === 'roles') {
      this.updated.push(payload);
      cb(null, {});
      return;
    }
    cb(null, {});
  }
}

test('ensureDefaultPermissions seeds the core permission catalog', async () => {
  const emitter = new PermissionMockEmitter([]);
  await ensureDefaultPermissions(emitter, 'jwt');

  const insertedKeys = emitter.inserted.map(row => row.permission_key);
  assert.strictEqual(insertedKeys.length, DEFAULT_PERMISSION_DEFINITIONS.length);
  assert(insertedKeys.includes('builder.use'));
  assert(insertedKeys.includes('auth.strategies.view'));
  assert(insertedKeys.includes('auth.strategies.manage'));
  assert(insertedKeys.includes('content.types.manage'));
  assert(insertedKeys.includes('content.update'));
  assert(insertedKeys.includes('comments.moderate'));
  assert(insertedKeys.includes('navigation.manage'));
  assert(insertedKeys.includes('seo.manage'));
  assert(insertedKeys.includes('search.manage'));
  assert(insertedKeys.includes('redirects.manage'));
  assert(insertedKeys.includes('media.manage'));
  assert(insertedKeys.includes('metadata.manage'));
  assert(insertedKeys.includes('importers.run'));
  assert(insertedKeys.includes('themes.list'));
  assert(insertedKeys.includes('themes.activate'));
});

test('ensureDefaultPermissions does not reinsert existing permissions', async () => {
  const emitter = new PermissionMockEmitter(
    DEFAULT_PERMISSION_DEFINITIONS.map(def => ({ permission_key: def.permission_key }))
  );

  await ensureDefaultPermissions(emitter, 'jwt');

  assert.deepStrictEqual(emitter.inserted, []);
});

test('ensureDefaultRoles gives new admin roles wildcard permissions', async () => {
  const emitter = new RoleMockEmitter([
    { id: 2, role_name: 'standard', permissions: '{}' }
  ]);

  await ensureDefaultRoles(emitter, 'jwt');

  const adminRole = emitter.inserted.find(role => role.role_name === 'admin');
  assert(adminRole);
  const permissions = JSON.parse(adminRole.permissions);
  assert.strictEqual(permissions['*'], true);
  assert.strictEqual(permissions.canAccessEverything, true);
});

test('ensureDefaultRoles upgrades legacy admin roles to wildcard permissions', async () => {
  const emitter = new RoleMockEmitter([
    { id: 1, role_name: 'admin', permissions: JSON.stringify({ canAccessEverything: true }) },
    { id: 2, role_name: 'standard', permissions: '{}' }
  ]);

  await ensureDefaultRoles(emitter, 'jwt');

  assert.strictEqual(emitter.updated.length, 1);
  assert.deepStrictEqual(emitter.updated[0].where, { id: 1 });
  const permissions = JSON.parse(emitter.updated[0].data.permissions);
  assert.strictEqual(permissions['*'], true);
  assert.strictEqual(permissions.canAccessEverything, true);
});

test('permission helpers preserve legacy admin compatibility', () => {
  assert.deepStrictEqual(parsePermissionBlob('{"content":{"update":true}}'), {
    content: { update: true }
  });

  const permissions = JSON.parse(makeAdminPermissionBlob({ content: { update: true } }));
  assert.strictEqual(permissions['*'], true);
  assert.strictEqual(permissions.canAccessEverything, true);
  assert.deepStrictEqual(permissions.content, { update: true });

  assert.strictEqual(
    hasPermission({ permissions: { canAccessEverything: true } }, 'content.update'),
    true
  );
});
