'use strict';
const { isIP } = require('node:net');
const providers = require('./providers');

const clean = value => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 100) : '';
function normalizeLocation(row) {
  if (!row || typeof row !== 'object') return { status: 'GEOIP_NOT_FOUND' };
  return { status: 'GEOIP_OK', country: clean(row.country?.iso_code),
    region: clean(row.subdivisions?.[0]?.names?.en || row.subdivisions?.[0]?.iso_code),
    city: clean(row.city?.names?.en), timezone: clean(row.location?.time_zone) };
}
function createGeoipService(config, request, registry = providers) {
  let adapter;
  let retryAfter = 0;
  let inFlight = 0;
  return { async lookup(rawIp) {
    if (!config.provider || config.provider === 'disabled') return { status: 'GEOIP_DISABLED' };
    const ip = String(rawIp || '').replace(/^::ffff:/, '');
    if (!isIP(ip)) return { status: 'GEOIP_IP_INVALID' };
    // Never forward local addresses to a paid service or infer a visitor from them.
    if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::1$|::$|f[cd]|fe[89ab])/i.test(ip)) return { status: 'GEOIP_PRIVATE_ADDRESS' };
    if (!registry[config.provider]) return { status: 'GEOIP_PROVIDER_UNKNOWN' };
    if (Date.now() < retryAfter) return { status: 'GEOIP_PROVIDER_UNAVAILABLE' };
    if (inFlight >= 8) return { status: 'GEOIP_BUSY' };
    inFlight++;
    try {
      adapter ||= registry[config.provider].create(config, request);
      return normalizeLocation(await (await adapter).lookup(ip));
    } catch (error) {
      adapter = null; retryAfter = Date.now() + 30000;
      return { status: /^GEOIP_[A-Z_]+$/.test(error?.message) ? error.message : 'GEOIP_PROVIDER_UNAVAILABLE' };
    } finally { inFlight--; }
  } };
}

// Stable host ingress, like Analytics' collector. Provider connections and limits
// belong to the host and survive replacement of authenticated event handlers.
let active = null;
const lookup = ip => active ? active.lookup(ip) : Promise.resolve({ status: 'GEOIP_NOT_INITIALIZED' });
function activate(service) { active = service; return () => { if (active === service) active = null; }; }
function getOrCreateService(config, request) {
  active ||= createGeoipService(config, request);
  return active;
}
module.exports = { createGeoipService, normalizeLocation, lookup, activate, getOrCreateService };
