'use strict';
const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');
const { requestBackendEvent } = require('../../contracts/backendEventContracts');
const { createGeoipService, activate } = require('./service');

module.exports = {
  lifecycleVersion: 1,
  async initialize({ motherEmitter, jwt, isCore, lifecycle }) {
    if (!isCore || !jwt || !motherEmitter) throw new Error('GEOIP_INITIALIZATION_INVALID');
    motherEmitter.registerModuleType('geoipManager', 'core');
    // Secrets and filesystem paths remain server deployment configuration.
    const config = { provider: process.env.GEOIP_PROVIDER || 'disabled', databasePath: process.env.GEOIP_DATABASE_PATH,
      accountId: process.env.MAXMIND_ACCOUNT_ID, licenseKey: process.env.MAXMIND_LICENSE_KEY,
      endpoint: process.env.GEOIP_SERVICE_URL, serviceToken: process.env.GEOIP_SERVICE_TOKEN };
    const service = createGeoipService(config, params => requestBackendEvent(motherEmitter, BACKEND_EVENTS.HTTP_REQUEST, {
      jwt, moduleName: 'geoipManager', moduleType: 'core', ...params
    }));
    const deactivate = activate(service);
    const handler = async (payload, callback) => {
      // No public lookup endpoint: only authenticated core modules may resolve IPs.
      const principal = payload.decodedJWT;
      if (!principal?.moduleName || motherEmitter._moduleTypes?.[principal.moduleName] !== 'core' || principal.isPublic || principal.isUser || payload.isExternalRequest || payload.moduleType !== 'core') return callback(new Error('GEOIP_FORBIDDEN'));
      callback(null, await service.lookup(payload.ip));
    };
    handler.moduleName = 'geoipManager';
    motherEmitter.on(BACKEND_EVENTS.GEOIP_LOOKUP, handler);
    const shutdown = () => { deactivate(); motherEmitter.removeListener?.(BACKEND_EVENTS.GEOIP_LOOKUP, handler); };
    lifecycle?.onCleanup(shutdown);
    return { shutdown };
  },
  async healthCheck() { /* Disabled and unconfigured providers are valid prepared states. */ }
};
