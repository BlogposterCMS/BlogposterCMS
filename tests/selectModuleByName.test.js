const assert = require('assert');

const { handleBuiltInPlaceholderPostgres } = require('../mother/modules/databaseManager/placeholders/postgresPlaceholders');
const { handleBuiltInPlaceholderMongo } = require('../mother/modules/databaseManager/placeholders/mongoPlaceholders');
const { handleBuiltInPlaceholderSqlite } = require('../mother/modules/databaseManager/placeholders/sqlitePlaceholders');

async function runPostgres(params) {
  const captured = {};
  const client = {
    query: async (sql, values) => {
      captured.values = values;
      return { rows: [] };
    }
  };
  await handleBuiltInPlaceholderPostgres(client, 'SELECT_MODULE_BY_NAME', params);
  return captured.values;
}

async function runMongo(params) {
  let received;
  const db = {
    collection: () => ({
      findOne: async (q) => {
        received = q;
        return null;
      }
    })
  };
  await handleBuiltInPlaceholderMongo(db, 'SELECT_MODULE_BY_NAME', params);
  return received;
}

async function runSqlite(params) {
  let received;
  const db = {
    run: async () => {},
    all: async (sql, values) => {
      received = values;
      return [];
    }
  };
  await handleBuiltInPlaceholderSqlite(db, 'SELECT_MODULE_BY_NAME', params);
  return received;
}

test('SELECT_MODULE_BY_NAME extracts moduleName from params array and object', async () => {
  const arrayParams = [{ moduleName: 'testMod' }];
  const objectParams = { moduleName: 'testMod' };

  assert.deepStrictEqual(await runPostgres(arrayParams), ['testMod']);
  assert.deepStrictEqual(await runPostgres(objectParams), ['testMod']);

  assert.deepStrictEqual(await runMongo(arrayParams), { module_name: 'testMod' });
  assert.deepStrictEqual(await runMongo(objectParams), { module_name: 'testMod' });

  assert.deepStrictEqual(await runSqlite(arrayParams), ['testMod']);
  assert.deepStrictEqual(await runSqlite(objectParams), ['testMod']);
});
