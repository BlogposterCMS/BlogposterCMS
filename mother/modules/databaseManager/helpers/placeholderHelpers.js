"use strict";

const { getDbType } = require('./dbTypeHelpers');

function ph(i) {
  return getDbType() === 'postgres' ? `$${i}` : '?';
}

module.exports = { ph };
