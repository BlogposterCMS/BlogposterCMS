const { execFileSync } = require('child_process');
const path = require('path');

test.each([
  ['postgres', 'pg'], ['mongodb', 'mongodb'], ['sqlite', 'sqlite3']
])('%s loads only its selected driver across shared module imports', (type, driver) => {
  // Real, isolated module graphs catch indirect imports hidden by engine mocks.
  execFileSync(process.execPath, ['-e', `
    const assert = require('assert');
    const fs = require('fs');
    const Module = require('module');
    const load = Module._load;
    const loaded = new Set();
    Module._load = function(name, ...args) {
      if (['pg', 'mongodb', 'sqlite3'].includes(name)) loaded.add(name);
      return load.call(this, name, ...args);
    };
    const base = './mother/modules/databaseManager/';
    require(base + 'index');
    require('./mother/modules/designerManager/dbPlaceholders');
    require('./mother/modules/userManagement/userCrudEvents');
    for (const file of fs.readdirSync(base + 'placeholders')) {
      if (file.endsWith('Placeholders.js')) require(base + 'placeholders/' + file);
    }
    assert.deepStrictEqual([...loaded], []);
    const { getEngine } = require(base + 'engines/engineFactory');
    const engine = getEngine();
    assert.strictEqual(getEngine(), engine);
    assert.deepStrictEqual([...loaded], [process.argv[1]]);
  `, driver], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, CONTENT_DB_TYPE: type },
    timeout: 15000,
    stdio: 'pipe'
  });
});

test('unsupported database configuration fails before loading a driver', () => {
  execFileSync(process.execPath, ['-e', `
    const assert = require('assert');
    const { getEngine } = require('./mother/modules/databaseManager/engines/engineFactory');
    assert.throws(getEngine, /DATABASE_ENGINE_UNSUPPORTED/);
  `], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, CONTENT_DB_TYPE: 'unsupported' },
    timeout: 15000,
    stdio: 'pipe'
  });
});
