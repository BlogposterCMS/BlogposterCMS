/**
 * mother/modules/databaseManager/engines/engineFactory.js
 */
const { getDbType } = require('../helpers/dbTypeHelpers');

function getEngine() {
  const type = getDbType();
  // Node caches the selected engine; unused drivers and pools stay unloaded.
  if (type === 'postgres') return require('./postgresEngine');
  if (type === 'mongodb') return require('./mongoEngine');
  if (type === 'sqlite') return require('./sqliteEngine');
  throw new Error(`[DATABASE_ENGINE_UNSUPPORTED] Unknown DB type=${type}`);
}

module.exports = { getEngine };
