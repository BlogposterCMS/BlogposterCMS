const { parseSchemaDefinition } = require('../mother/modules/databaseManager/helpers/schemaDefinitionParser');

test('generates operations for postgres', () => {
  const def = { tables: [{ name: 'demo', columns: [{ name: 'id', type: 'id' }, { name: 'title', type: 'text' }] }] };
  const ops = parseSchemaDefinition(def, 'postgres');
  expect(Array.isArray(ops)).toBe(true);
  expect(ops[0].sql).toMatch(/CREATE TABLE IF NOT EXISTS demo/);
});

test('generates collections for mongodb', () => {
  const def = { collections: ['demo'] };
  const ops = parseSchemaDefinition(def, 'mongodb');
  expect(ops[0].createCollection).toBe('demo');
});
