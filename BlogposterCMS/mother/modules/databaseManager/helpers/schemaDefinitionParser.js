"use strict";

function sanitizeName(name) {
  if (typeof name !== 'string' || !/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error('Invalid identifier in schema definition');
  }
  return name;
}

function mapColumn(column, dbType) {
  const name = sanitizeName(column.name);
  const type = column.type || 'text';
  const pgMap = {
    id: 'SERIAL PRIMARY KEY',
    text: 'TEXT',
    string: 'VARCHAR(255)',
    int: 'INTEGER',
    boolean: 'BOOLEAN',
    timestamp: 'TIMESTAMP',
  };
  const sqliteMap = {
    id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
    text: 'TEXT',
    string: 'TEXT',
    int: 'INTEGER',
    boolean: 'INTEGER',
    timestamp: 'TEXT',
  };
  const map = dbType === 'postgres' ? pgMap : sqliteMap;
  if (!map[type]) {
    throw new Error(`Unsupported column type: ${type}`);
  }
  return `"${name}" ${map[type]}`;
}

function parseSchemaDefinition(definition, dbType) {
  const operations = [];
  if (dbType === 'mongodb') {
    const collections = [];
    if (Array.isArray(definition.collections)) {
      collections.push(...definition.collections);
    } else if (Array.isArray(definition.tables)) {
      collections.push(...definition.tables.map(t => t.name));
    }
    for (const col of collections) {
      operations.push({ createCollection: sanitizeName(col) });
    }
    return operations;
  }

  if (Array.isArray(definition.tables)) {
    for (const table of definition.tables) {
      const tableName = sanitizeName(table.name);
      const columns = Array.isArray(table.columns) ? table.columns : [];
      const columnDefs = columns.map(c => mapColumn(c, dbType));
      if (columnDefs.length === 0) {
        columnDefs.push(dbType === 'postgres' ? 'id SERIAL PRIMARY KEY' : 'id INTEGER PRIMARY KEY AUTOINCREMENT');
      }
      const sql = `CREATE TABLE IF NOT EXISTS ${tableName} (${columnDefs.join(', ')})`;
      operations.push({ sql });
    }
  }
  return operations;
}

module.exports = { parseSchemaDefinition };
