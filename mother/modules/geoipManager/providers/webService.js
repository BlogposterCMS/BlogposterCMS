'use strict';

// Both services reuse RequestManager's pinned DNS, host allowlist and bounds.
// A self-hosted endpoint implements the documented MaxMind-compatible JSON shape.
module.exports = {
  async create(config, request) {
    if (config.provider === 'maxmind-web' && (!config.accountId || !config.licenseKey)) throw new Error('GEOIP_CREDENTIALS_NOT_CONFIGURED');
    const base = config.provider === 'maxmind-web' ? 'https://geoip.maxmind.com/geoip/v2.1/city/' : config.endpoint;
    let parsed;
    try { parsed = new URL(base); } catch { throw new Error('GEOIP_ENDPOINT_INVALID'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('GEOIP_ENDPOINT_INVALID');
    const authorization = config.provider === 'maxmind-web'
      ? `Basic ${Buffer.from(`${config.accountId}:${config.licenseKey}`).toString('base64')}`
      : config.serviceToken ? `Bearer ${config.serviceToken}` : null;
    return { lookup: async ip => {
      try {
        const result = await request({ url: `${base.replace(/\/$/, '')}/${encodeURIComponent(ip)}`, method: 'get',
          headers: authorization ? { Authorization: authorization } : {} });
        if (result?.status !== 200) throw new Error('GEOIP_PROVIDER_RESPONSE_INVALID');
        return result.data;
      } catch { throw new Error('GEOIP_PROVIDER_UNAVAILABLE'); }
    } };
  }
};
