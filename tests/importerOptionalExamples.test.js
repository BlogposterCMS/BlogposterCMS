'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const filename = path.resolve(__dirname, '../mother/modules/importer/importers/exampleSite.js');
const nativeRequire = createRequire(filename);
const examplePath = '../../../../examples/docs-site';

// Model the release image's missing optional directory without masking failures
// thrown by code inside an example which is actually installed.
function loadExample({ missing = false, loadError, resolveError } = {}) {
  const localRequire = request => {
    if (request === examplePath && loadError) throw loadError;
    return nativeRequire(request);
  };
  localRequire.resolve = request => {
    if (request === examplePath && (missing || resolveError)) {
      throw resolveError || Object.assign(new Error('example omitted from runtime'), { code: 'MODULE_NOT_FOUND' });
    }
    return nativeRequire.resolve(request);
  };
  const module = { exports: {} };
  new vm.Script(`(function(require,module,exports){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })
    .runInThisContext()(localRequire, module, module.exports);
  return module.exports;
}

test('release images omit the unavailable example importer', () => {
  expect(loadExample({ missing: true })).toBeNull();
});
test('source installations retain the existing example importer', () => {
  expect(loadExample()).toMatchObject({ name: 'exampleSite', import: expect.any(Function) });
});
test('nested module errors remain fatal for installed examples', () => {
  const error = Object.assign(new Error('missing nested dependency'), { code: 'MODULE_NOT_FOUND' });
  expect(() => loadExample({ loadError: error })).toThrow(error);
});
test('unexpected resolution failures remain fatal', () => {
  const error = Object.assign(new Error('access denied'), { code: 'EACCES' });
  expect(() => loadExample({ resolveError: error })).toThrow(error);
});
