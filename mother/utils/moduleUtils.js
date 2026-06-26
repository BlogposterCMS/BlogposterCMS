'use strict';

function sanitizeModuleName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('Invalid module name');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new Error('Invalid module name');
  }
  return name;
}

module.exports = { sanitizeModuleName };
