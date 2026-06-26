const assert = require('assert');
const { deepMerge } = require('../mother/modules/userManagement/permissionUtils');

function testPrototypePollution() {
  const target = {};
  const source = JSON.parse('{ "__proto__": { "polluted": true } }');
  deepMerge(target, source);
  assert.strictEqual({}.polluted, undefined, 'Object prototype was polluted');
  assert.strictEqual(target.polluted, undefined, 'Target object was polluted');
}

function testRegularMerge() {
  const target = { a: 1, b: { c: 3 } };
  deepMerge(target, { b: { d: 4 }, e: 5 });
  assert.strictEqual(target.a, 1);
  assert.strictEqual(target.b.c, 3);
  assert.strictEqual(target.b.d, 4);
  assert.strictEqual(target.e, 5);
}

test('deepMerge prevents prototype pollution', () => {
  testPrototypePollution();
  testRegularMerge();
});

