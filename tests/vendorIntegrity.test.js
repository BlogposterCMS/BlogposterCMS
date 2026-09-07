const { verifyBytes } = require('../tools/check-vendor-integrity');
const fs = require('node:fs');
const path = require('node:path');
const manifest = require('../ui/shared/vendor/echarts-manifest.json');
test('rejects altered distribution bytes instead of refreshing trusted hashes', () => {
  const file = manifest.files[0];
  const bytes = fs.readFileSync(path.join(__dirname, '..', file.path));
  expect(() => verifyBytes(bytes, file.sha256, file.path)).not.toThrow();
  const changed = Buffer.from(bytes); changed[100] ^= 1;
  expect(() => verifyBytes(changed, file.sha256, file.path)).toThrow('VENDOR_INTEGRITY_MISMATCH');
});
