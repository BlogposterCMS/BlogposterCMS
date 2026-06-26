/**
 * mother/modules/databaseManager/helpers/cryptoHelpers.js
 *
 * Helper functions for hashing names, passwords, generating usernames, etc.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { moduleDbSalt } = require('../config/databaseConfig');

const storePath = path.join(__dirname, '..', 'modulePasswords.json');

function loadStore() {
  if (!fs.existsSync(storePath)) return {};
  try { return JSON.parse(fs.readFileSync(storePath, 'utf8')); } catch { return {}; }
}

function saveStore(obj) {
  fs.writeFileSync(storePath, JSON.stringify(obj, null, 2));
}

function createHashedName(input, salt = '') {
  return crypto
    .createHmac('sha256', salt)
    .update(input)
    .digest('hex')
    .substring(0, 16)
    .toLowerCase();
}

function createHashedPassword(input, salt = '') {
  return crypto
    .createHmac('sha256', salt)
    .update(input)
    .digest('hex')
    .toLowerCase();
}

function generateModuleUsername(moduleName, salt = '') {
  const hashed = createHashedName(moduleName, salt);
  return hashed.substring(0, 63).toLowerCase();
}

function generateUserAndPass(moduleName) {
  // For 'databaseManager' we just use admin credentials.
  if (moduleName.toLowerCase() === 'databasemanager') {
    return null; // indicates we'll use admin user
  }
  const user = generateModuleUsername(moduleName, moduleDbSalt);
  const store = loadStore();
  if (!store[user]) {
    store[user] = crypto.randomBytes(32).toString('hex');
    saveStore(store);
  }
  const pass = store[user];
  return { user, pass };
}

module.exports = {
  createHashedName,
  createHashedPassword,
  generateModuleUsername,
  generateUserAndPass
};
