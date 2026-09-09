'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Both publication and branch validation must exercise real Linux isolation;
// a missing host policy must fail the gate instead of skipping sandbox tests.
test.each(['ci.yml', 'release.yml'])('%s retains the Linux sandbox gate', filename => {
  const source = fs.readFileSync(path.join(__dirname, '../.github/workflows', filename), 'utf8');
  const workflow = yaml.load(source);
  const steps = Object.values(workflow.jobs).flatMap(job => job.steps || []);
  const gate = steps.find(step => step.name === 'Install and verify Linux community isolation');
  expect(gate).toBeDefined();
  expect(gate['continue-on-error']).not.toBe(true);
  expect(gate.run).toContain('apparmor-profiles');
  expect(gate.run).toContain('apparmor_parser -r /usr/share/apparmor/extra-profiles/bwrap-userns-restrict');
  expect(gate.run).toContain('sudo -u blogposter-sandbox-test "$(command -v node)" tools/verify-community-sandbox.js');
  expect(gate.run).not.toMatch(/sysctl|unconfined|\|\|\s*true/);
  const integration = steps.find(step => step.name === 'Run real Linux sandbox integration tests');
  expect(gate.run).toContain('sudo useradd --system --create-home --user-group blogposter-sandbox-test');
  expect(integration.run).toContain('sudo -u blogposter-sandbox-test "$(command -v node)" node_modules/jest/bin/jest.js --runInBand tests/moduleProcessRuntime.test.js tests/moduleRegistryEventsActivation.test.js');
  expect(integration['continue-on-error']).not.toBe(true);
  expect(steps.indexOf(integration)).toBeLessThan(steps.findIndex(step => step.name === 'Build'));
  const rest = steps.find(step => step.name === 'Run test suite').run;
  expect(rest).toBe("npm test -- --runInBand --testPathIgnorePatterns 'tests/(moduleProcessRuntime|moduleRegistryEventsActivation)\\.test\\.js$'");
});
