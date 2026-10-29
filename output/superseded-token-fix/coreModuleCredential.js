'use strict';

const jwt = require('jsonwebtoken');

const DEFAULT_REFRESH_BEFORE_EXPIRY_MS = 30_000;

function credentialError(code, moduleName, cause) {
  return Object.assign(new Error(`${code}: ${moduleName}`), {
    code,
    moduleName,
    status: 503,
    ...(cause ? { cause } : {})
  });
}

function tokenExpiry(token, moduleName, now) {
  if (typeof token !== 'string' || !token) {
    throw credentialError('CORE_MODULE_CREDENTIAL_INVALID', moduleName);
  }

  let decoded;
  try { decoded = jwt.decode(token); }
  catch (error) {
    throw credentialError('CORE_MODULE_CREDENTIAL_INVALID', moduleName, error);
  }
  if (!decoded || typeof decoded !== 'object' || !Number.isFinite(decoded.exp)) {
    throw credentialError('CORE_MODULE_CREDENTIAL_INVALID', moduleName);
  }

  const expiresAt = decoded.exp * 1000;
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    throw credentialError('CORE_MODULE_CREDENTIAL_EXPIRED', moduleName);
  }
  return expiresAt;
}

/**
 * Host-owned exp-aware cache. Decoding only schedules renewal; MotherEmitter
 * remains responsible for authenticating every issued token at dispatch.
 */
function createCoreModuleCredentialProvider({
  issueToken,
  now = Date.now,
  refreshBeforeExpiryMs = DEFAULT_REFRESH_BEFORE_EXPIRY_MS
} = {}) {
  if (typeof issueToken !== 'function') {
    throw new TypeError('CORE_MODULE_CREDENTIAL_ISSUER_INVALID: issueToken is required.');
  }
  if (typeof now !== 'function' || !Number.isFinite(refreshBeforeExpiryMs) || refreshBeforeExpiryMs < 0) {
    throw new TypeError('CORE_MODULE_CREDENTIAL_CONFIG_INVALID: invalid clock or refresh window.');
  }

  const cache = new Map();
  const inFlight = new Map();

  return function getCoreModuleCredential(moduleName) {
    const normalizedName = String(moduleName || '').trim();
    if (!normalizedName) {
      throw credentialError('CORE_MODULE_CREDENTIAL_MODULE_INVALID', 'unknown');
    }

    const cached = cache.get(normalizedName);
    const currentTime = now();
    if (cached && cached.expiresAt - currentTime > refreshBeforeExpiryMs) {
      return cached.token;
    }
    if (inFlight.has(normalizedName)) return inFlight.get(normalizedName);

    const issuance = Promise.resolve()
      .then(() => issueToken(normalizedName))
      .then(token => {
        const expiresAt = tokenExpiry(token, normalizedName, now());
        cache.set(normalizedName, { token, expiresAt });
        return token;
      })
      .finally(() => inFlight.delete(normalizedName));
    inFlight.set(normalizedName, issuance);
    return issuance;
  };
}

module.exports = {
  DEFAULT_REFRESH_BEFORE_EXPIRY_MS,
  createCoreModuleCredentialProvider
};
