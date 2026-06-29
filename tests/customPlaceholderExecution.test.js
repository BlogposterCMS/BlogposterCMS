const fs = require('fs');
const path = require('path');

const tmpDir = path.join(__dirname, 'tmpdata');
fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });
process.env.SQLITE_STORAGE = tmpDir;

const placeholderFile = path.join(
  __dirname,
  '../mother/modules/databaseManager/placeholders/placeholderData.json'
);
if (fs.existsSync(placeholderFile)) fs.unlinkSync(placeholderFile);

const { performSqliteOperation } = require('../mother/modules/databaseManager/engines/sqliteEngine');
const { registerCustomPlaceholder } = require('../mother/modules/databaseManager/placeholders/placeholderRegistry');

test('performSqliteOperation executes custom placeholder', async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  let called = false;
  global.loadedModules = global.loadedModules || {};
  global.loadedModules.dummyModule = {
    async testHandler() {
      called = true;
      return { ok: true };
    }
  };

  registerCustomPlaceholder('TEST_PLACEHOLDER', { moduleName: 'dummyModule', functionName: 'testHandler' });

  const result = await performSqliteOperation('dummyModule', 'TEST_PLACEHOLDER', [], false);

  expect(result).toEqual({ ok: true });
  expect(called).toBe(true);

  delete global.loadedModules.dummyModule;
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (fs.existsSync(placeholderFile)) fs.unlinkSync(placeholderFile);
});

test('performSqliteOperation refuses custom placeholders owned by process modules', async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  global.loadedModules = global.loadedModules || {};
  global.loadedModules.externalModule = {
    moduleType: 'community',
    runtime: 'process'
  };

  registerCustomPlaceholder('PROCESS_PLACEHOLDER', {
    moduleName: 'externalModule',
    functionName: 'testHandler'
  });

  await expect(
    performSqliteOperation('externalModule', 'PROCESS_PLACEHOLDER', [], false)
  ).rejects.toThrow(/E_PLACEHOLDER_PROCESS_MODULE_UNSUPPORTED/);

  delete global.loadedModules.externalModule;
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (fs.existsSync(placeholderFile)) fs.unlinkSync(placeholderFile);
});
