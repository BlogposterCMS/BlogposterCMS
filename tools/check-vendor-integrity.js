/* Verify reviewed distribution bytes before building; never download or approve updates here. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
function verifyBytes(bytes, expected, label) {
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) throw new Error(`VENDOR_INTEGRITY_MISMATCH: ${label}`);
}
if (require.main === module) {
  const manifest = require('../ui/shared/vendor/echarts-manifest.json');
  for (const file of manifest.files) verifyBytes(fs.readFileSync(path.join(root, file.path)), file.sha256, file.path);
  console.log(`Vendor integrity verified: ${manifest.name} ${manifest.version}`);
}
module.exports = { verifyBytes };
