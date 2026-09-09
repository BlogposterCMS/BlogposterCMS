'use strict';
const maxmind = require('maxmind');

// The database is operator-provided data, never bundled or downloaded silently.
module.exports = {
  id: 'maxmind-db',
  async create(config) {
    if (!config.databasePath) throw new Error('GEOIP_DATABASE_NOT_CONFIGURED');
    let reader;
    try { reader = await maxmind.open(config.databasePath); }
    catch { throw new Error('GEOIP_DATABASE_UNAVAILABLE'); }
    return { lookup: async ip => reader.get(ip) };
  }
};
