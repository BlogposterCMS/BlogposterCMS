const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');

test.each(['install-blogposter', 'install-update-agent'])('%s is valid Bash on the deployment host', file => {
  const result = spawnSync('bash', ['-n'], {
    input: fs.readFileSync(path.join(root, 'deploy', file), 'utf8').replace(/\r\n/g, '\n'), encoding: 'utf8'
  });
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
});

test('unrecognized installation arguments fail before privileged host setup', () => {
  const script = fs.readFileSync(path.join(root, 'deploy/install-blogposter'), 'utf8');
  const result = spawnSync('bash', ['-s', '--', '--command', 'reboot'], { input: script, encoding: 'utf8' });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('CORE_INSTALL_ARGUMENT_INVALID');
});

test('host-agent restarts preserve the directory mounted into the CMS', () => {
  const unit = fs.readFileSync(path.join(root, 'deploy/blogposter-update-agent.service'), 'utf8');
  expect(unit).toMatch(/^RuntimeDirectory=blogposter-updater\r?$/m);
  expect(unit).toMatch(/^RuntimeDirectoryPreserve=yes\r?$/m);
  expect(unit).toMatch(/^RuntimeDirectoryMode=0750\r?$/m);
  expect(unit).toMatch(/^Group=blogposter-updater\r?$/m);
});

test('repeated installer reconnects existing CMS mounts before checking socket access', () => {
  const script = fs.readFileSync(path.join(root, 'deploy/install-update-agent'), 'utf8');
  const restart = script.indexOf('systemctl restart blogposter-update-agent.service');
  const reconnect = script.indexOf('compose_run up -d --no-deps --force-recreate "$BLOGPOSTER_SERVICE"');
  const accessCheck = script.indexOf('CORE_UPDATE_SETUP_CONTAINER_ACCESS_FAILED');
  expect(restart).toBeGreaterThan(0);
  expect(reconnect).toBeGreaterThan(restart);
  expect(accessCheck).toBeGreaterThan(reconnect);
  // Never recreate dependencies or renew persistent volumes during bootstrap.
  expect(script).not.toMatch(/--renew-anon-volumes|compose_run down|volume rm/);
});
