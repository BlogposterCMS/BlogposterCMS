const assert = require('assert');
const { ensureDefaultPermissions } = require('../mother/modules/userManagement/userInitService');

class MockEmitter {
  constructor(existing = []) {
    this.existing = existing;
    this.inserted = [];
  }
  emit(event, payload, cb) {
    if (event === 'dbSelect' && payload.table === 'permissions') {
      cb(null, this.existing);
    } else if (event === 'dbInsert' && payload.table === 'permissions') {
      this.inserted.push(payload.data.permission_key);
      cb(null, {});
    } else {
      cb(null, {});
    }
  }
}

test('ensureDefaultPermissions seeds builder.use', async () => {
  const emitter = new MockEmitter([]);
  await ensureDefaultPermissions(emitter, 'jwt');
  assert(emitter.inserted.includes('builder.use'));
});
