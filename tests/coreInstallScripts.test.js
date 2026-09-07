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
