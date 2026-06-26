/**
 * mother/modules/databaseManager/helpers/dbTypeHelpers.js
 *
 * Simple helper for checking which DB type we want, and if a module uses its own DB.
 */
const { dbType, hasOwnDbList } = require('../config/databaseConfig');

function getDbType() {
  return dbType;
}

function moduleHasOwnDb(moduleName) {
  return hasOwnDbList.includes(moduleName.toLowerCase());
}

module.exports = {
  getDbType,
  moduleHasOwnDb
};
