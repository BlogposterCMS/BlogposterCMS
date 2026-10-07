'use strict';

// PostgreSQL cannot bind DDL identifiers/types as query parameters.
function identifier(value) {
  if (typeof value !== 'string' || !value || value.includes('\0') || Buffer.byteLength(value) > 63) {
    throw Object.assign(new Error('DB_SQL_IDENTIFIER_INVALID'), { code: 'DB_SQL_IDENTIFIER_INVALID' });
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function literal(value) {
  if (typeof value !== 'string' || value.includes('\0')) {
    throw Object.assign(new Error('DB_SQL_LITERAL_INVALID'), { code: 'DB_SQL_LITERAL_INVALID' });
  }
  // E-strings escape backslashes regardless of standard_conforming_strings.
  return `E'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function columnType(value) {
  if (typeof value !== 'string' || !/^(?:TEXT|BOOLEAN|SMALLINT|INTEGER|BIGINT|REAL|DOUBLE PRECISION|DATE|TIMESTAMP(?: WITH(?:OUT)? TIME ZONE)?|JSONB?|UUID|VARCHAR\([1-9][0-9]{0,4}\)|NUMERIC\([1-9][0-9]?(?:,[0-9]{1,2})?\))$/i.test(value)) {
    throw Object.assign(new Error('DB_SQL_COLUMN_TYPE_INVALID'), { code: 'DB_SQL_COLUMN_TYPE_INVALID' });
  }
  return value;
}

module.exports = { identifier, literal, columnType };
