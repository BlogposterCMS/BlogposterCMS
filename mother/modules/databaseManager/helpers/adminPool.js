/**
 * mother/modules/databaseManager/helpers/adminPool.js
 *
 * Provides the adminPool for Postgres operations like checking DB existence,
 * creating roles, etc.
 */
const { Pool } = require('pg');
const {
  pgAdminUser,
  pgAdminPass,
  pgAdminDb,
  pgHost,
  pgPort
} = require('../config/databaseConfig');

const adminPool = new Pool({
  user: pgAdminUser,
  host: pgHost,
  database: pgAdminDb,
  password: pgAdminPass,
  port: pgPort
});

module.exports = { adminPool };
