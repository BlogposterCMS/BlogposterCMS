'use strict';

const jwt = require('jsonwebtoken');

const DEFAULT_RENEWAL_LEAD_MS = 5 * 60 * 1000;

function credentialError(code, moduleName, cause) {
  return Object.assign(new Error(`${code}: ${moduleName}`), {
    code,
    moduleName,
    ...(cause ? { cause } : {})
  });
}

function tokenTiming(token, moduleName) {
  if (typeof token !== 'string' || !token) {
    throw credentialError('CORE_MODULE_CREDENTIAL_INVALID', moduleName);
  }
  const decoded = jwt.decode(token);
  if (!decoded || decoded.moduleName !== moduleName || decoded.trustLevel !== 'high' ||
      decoded.isPublic === true || decoded.isUser === true || decoded.userId != null ||
      !Number.isFinite(decoded.iat) || !Number.isFinite(decoded.exp) || decoded.exp <= decoded.iat) {
    throw credentialError('CORE_MODULE_CREDENTIAL_INVALID', moduleName);
  }
  return { issuedAtMs: decoded.iat * 1000, expiresAtMs: decoded.exp * 1000 };
}

/** Host-owned, expiry-aware cache around the existing Auth issuance authority. */
function createCoreModuleCredentialProvider({
  moduleName,
  issueToken,
  now = Date.now,
  renewalLeadMs = DEFAULT_RENEWAL_LEAD_MS
}) {
  if (!moduleName || typeof issueToken !== 'function' || typeof now !== 'function' ||
      !Number.isFinite(renewalLeadMs) || renewalLeadMs < 0) {
    throw credentialError('CORE_MODULE_CREDENTIAL_PROVIDER_INVALID', moduleName || 'unknown');
  }

  let current = null;
  let inFlight = null;

  function isFresh() {
    return Boolean(current && now() < current.renewAtMs);
  }

  async function getToken() {
    if (isFresh()) return current.token;
    if (inFlight) return inFlight;

    inFlight = Promise.resolve()
      .then(() => issueToken(moduleName))
      .then(token => {
        const timing = tokenTiming(token, moduleName);
        if (timing.expiresAtMs <= now()) {
          throw credentialError('CORE_MODULE_CREDENTIAL_INVALID', moduleName);
        }
        const lifetimeMs = timing.expiresAtMs - timing.issuedAtMs;
        current = {
          token,
          expiresAtMs: timing.expiresAtMs,
          renewAtMs: timing.expiresAtMs - Math.min(renewalLeadMs, lifetimeMs / 2)
        };
        return token;
      })
      .catch(error => {
        if (error?.code === 'CORE_MODULE_CREDENTIAL_INVALID') throw error;
        throw credentialError('CORE_MODULE_CREDENTIAL_ISSUANCE_FAILED', moduleName, error);
      })
      .finally(() => { inFlight = null; });

    return inFlight;
  }

  return {
    getToken,
    currentToken: () => isFresh() ? current.token : null
  };
}

module.exports = {
  DEFAULT_RENEWAL_LEAD_MS,
  createCoreModuleCredentialProvider,
  credentialError
};
