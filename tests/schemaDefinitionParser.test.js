const { parseSchemaDefinition } = require('../mother/modules/databaseManager/helpers/schemaDefinitionParser');

test('generates operations for postgres', () => {
  const def = { tables: [{ name: 'demo', columns: [{ name: 'id', type: 'id' }, { name: 'title', type: 'text' }] }] };
  const ops = parseSchemaDefinition(def, 'postgres');
  expect(Array.isArray(ops)).toBe(true);
  expect(ops[0].sql).toMatch(/CREATE TABLE IF NOT EXISTS demo/);
});

test('includes schema when provided', () => {
  const def = { tables: [{ name: 'demo', schema: 'design', columns: [{ name: 'id', type: 'id' }] }] };
  const ops = parseSchemaDefinition(def, 'postgres');
  expect(ops[0].sql).toBe('CREATE SCHEMA IF NOT EXISTS design');
  expect(ops[1].sql).toMatch(/CREATE TABLE IF NOT EXISTS design\.demo/);
});

test('generates collections for mongodb', () => {
  const def = { collections: ['demo'] };
  const ops = parseSchemaDefinition(def, 'mongodb');
  expect(ops[0].createCollection).toBe('demo');
});
