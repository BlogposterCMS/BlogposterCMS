const assert = require('assert');
const { sanitizeModuleName } = require('../mother/utils/moduleUtils');

function testValid() {
  assert.doesNotThrow(() => sanitizeModuleName('example_module-1'));
}

function testInvalid() {
  assert.throws(() => sanitizeModuleName('../evil'), /Invalid module name/);
  assert.throws(() => sanitizeModuleName('bad/name'), /Invalid module name/);
}

test('module name sanitization', () => {
  testValid();
  testInvalid();
});

