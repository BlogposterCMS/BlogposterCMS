const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

test('release package, lockfile, changelog and host policy remain aligned', () => {
  const pkg = require('../package.json');
  const lock = require('../package-lock.json');
  const policy = require('../deploy/update-policy.json');
  expect(lock.version).toBe(pkg.version);
  expect(lock.packages[''].version).toBe(pkg.version);
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  expect(changelog).toContain(`## [${pkg.version}]`);
  // A CMS image must not silently require an unpublished host executor.
  const updater = fs.readFileSync(path.join(root, 'deploy/blogposter-update'), 'utf8');
  expect(updater).toContain(`UPDATER_VERSION='${policy.minimumUpdaterVersion}'`);
});
