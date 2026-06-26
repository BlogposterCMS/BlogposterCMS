/**
 * mother/modules/databaseManager/config/databaseConfig.js
 *
 * Loads and provides environment variables in a single place,
 * so we don't sprinkle process.env calls everywhere.
 */

require('dotenv').config();

// Support legacy "DB_TYPE" while documenting "CONTENT_DB_TYPE"
const dbType = process.env.CONTENT_DB_TYPE
  || process.env.DB_TYPE
  || 'postgres';
const moduleDbSalt = process.env.MODULE_DB_SALT || '';
const hasOwnDbList = (process.env.HAS_OWN_DB || '')
  .split(',')
  .map(x => x.trim().toLowerCase())
  .filter(x => x.length > 0);

module.exports = {
  dbType,
  moduleDbSalt,
  hasOwnDbList,
  // Postgres stuff
  pgAdminUser: (process.env.PG_ADMIN_USER || '').toLowerCase(),
  pgAdminDb:   (process.env.PG_ADMIN_DB   || '').toLowerCase(),
  pgAdminPass: process.env.PG_ADMIN_PASSWORD || '',
  pgHost:      process.env.PG_HOST || 'localhost',
  pgPort:      parseInt(process.env.PG_PORT, 10) || 5432,
  pgMainDb:    (process.env.PG_MAIN_DB || 'postgres').toLowerCase(),
  pgMainUser:  (process.env.PG_MAIN_USER || 'cmsuser').toLowerCase(),
  pgMainPass:  process.env.PG_MAIN_PASSWORD || '',

  // Mongo stuff
  mongoAdminUser:     process.env.MONGO_ADMIN_USER || 'admin',
  mongoAdminPassword: process.env.MONGO_ADMIN_PASSWORD || 'adminpass',
  mongoHost:          process.env.MONGO_HOST || 'localhost',
  mongoPort:          process.env.MONGO_PORT || '27017',
  mongoUri:           process.env.MONGODB_URI || null,

  // SQLite
  sqliteStorage:      process.env.SQLITE_STORAGE || './data',
  sqliteMainFile:     process.env.SQLITE_MAIN_FILE || 'cms.sqlite'
};
