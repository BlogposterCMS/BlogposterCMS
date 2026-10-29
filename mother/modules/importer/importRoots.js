'use strict';

const path = require('path');
// Staging is host data, never a directory inside an immutable code generation.
module.exports = Object.freeze([
  path.resolve(__dirname, '../../../temp_uploads/imports'),
  path.resolve(__dirname, '../../../data/imports')
]);
