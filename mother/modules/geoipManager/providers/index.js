'use strict';
const database = require('./maxmindDatabase');
const webService = require('./webService');

// Provider implementations live here; callers only depend on geoipManager.
module.exports = Object.freeze({
  'maxmind-db': database,
  'maxmind-web': webService,
  'self-hosted': webService
});
