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
  let colDef = `"${name}" ${map[type]}`;
  if (column.notNull) colDef += ' NOT NULL';
  if (column.unique) colDef += ' UNIQUE';
  if (Object.prototype.hasOwnProperty.call(column, 'default')) {
    const defVal = column.default;
    if (typeof defVal === 'number') colDef += ` DEFAULT ${defVal}`;
    else if (typeof defVal === 'boolean') colDef += ` DEFAULT ${defVal ? 1 : 0}`;
    else if (typeof defVal === 'string') {
      const escapeSqlString = str => String(str).replace(/\\/g, '\\\\').replace(/'/g, "''");
      colDef += ` DEFAULT '${escapeSqlString(defVal)}'`;
    }
  }
  return colDef;
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
      const schema = table.schema ? sanitizeName(table.schema) : null;
      const fullName = schema && dbType === 'postgres' ? `${schema}.${tableName}` : tableName;
      if (schema && dbType === 'postgres') {
        operations.push({ sql: `CREATE SCHEMA IF NOT EXISTS ${schema}` });
      }
      const columns = Array.isArray(table.columns) ? table.columns : [];
      const columnDefs = columns.map(c => mapColumn(c, dbType));
      if (columnDefs.length === 0) {
        columnDefs.push(dbType === 'postgres' ? 'id SERIAL PRIMARY KEY' : 'id INTEGER PRIMARY KEY AUTOINCREMENT');
      }
      const sql = `CREATE TABLE IF NOT EXISTS ${fullName} (${columnDefs.join(', ')})`;
      operations.push({ sql });

      const addIndex = (cols, unique, name) => {
        const colsSan = cols.map(c => `"${sanitizeName(c)}"`).join(', ');
        const idxName = sanitizeName(name || `${tableName}_${cols.join('_')}${unique ? '_uniq' : '_idx'}`);
        const stmt = `CREATE ${unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${idxName} ON ${fullName} (${colsSan})`;
        operations.push({ sql: stmt });
      };

      if (Array.isArray(table.indexes)) {
        for (const idx of table.indexes) {
          if (Array.isArray(idx.columns) && idx.columns.length) {
            addIndex(idx.columns, false, idx.name);
          }
        }
      }
      if (Array.isArray(table.uniques)) {
        for (const idx of table.uniques) {
          if (Array.isArray(idx.columns) && idx.columns.length) {
            addIndex(idx.columns, true, idx.name);
          }
        }
      }
    }
  }
  return operations;
}

module.exports = { parseSchemaDefinition };
