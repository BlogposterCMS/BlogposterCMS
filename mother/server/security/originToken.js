'use strict';

const crypto = require('crypto');

const MIN_ORIGIN_TOKEN_TTL = 60;

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 ? '='.repeat(4 - (normalized.length % 4)) : '';
  return Buffer.from(normalized + padding, 'base64');
}

function createOriginToken(origins, securityConfig) {
  const keyConfig = securityConfig.postMessage?.originToken;
  if (
    !keyConfig?.privateKey ||
    !keyConfig?.publicKey ||
    !Array.isArray(origins) ||
    !origins.length
  ) {
    return null;
  }

  const ttlSeconds = Math.max(Number(keyConfig.ttlSeconds || 0), MIN_ORIGIN_TOKEN_TTL);
  const now = Date.now();
  const payload = {
    origins,
    issuedAt: now,
    expiresAt: now + (ttlSeconds * 1000),
    nonce: crypto.randomBytes(16).toString('hex')
  };
  const payloadBuffer = Buffer.from(JSON.stringify(payload), 'utf8');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(payloadBuffer);
  signer.end();
  const signature = signer.sign(keyConfig.privateKey);
  return `${base64UrlEncode(payloadBuffer)}.${base64UrlEncode(signature)}`;
}

function verifyOriginToken(token, securityConfig, options = {}) {
  const publicKey = securityConfig?.postMessage?.originToken?.publicKey;
  const parts = String(token || '').split('.');
  if (!publicKey || parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, code: 'DESIGNER_LIVE_PREVIEW_ORIGIN_TOKEN_MALFORMED' };
  }
  try {
    const payloadBuffer = base64UrlDecode(parts[0]);
    const signature = base64UrlDecode(parts[1]);
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(payloadBuffer);
    verifier.end();
    if (!verifier.verify(publicKey, signature)) {
      return { valid: false, code: 'DESIGNER_LIVE_PREVIEW_ORIGIN_TOKEN_SIGNATURE_INVALID' };
    }
    const payload = JSON.parse(payloadBuffer.toString('utf8'));
    const now = Number.isFinite(options.now) ? Number(options.now) : Date.now();
    const issuedAt = Number(payload?.issuedAt);
    const expiresAt = Number(payload?.expiresAt);
    const origins = Array.isArray(payload?.origins) ? payload.origins.filter(Boolean) : [];
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || !origins.length) {
      return { valid: false, code: 'DESIGNER_LIVE_PREVIEW_ORIGIN_TOKEN_PAYLOAD_INVALID' };
    }
    if (issuedAt > now + 30000) {
      return { valid: false, code: 'DESIGNER_LIVE_PREVIEW_ORIGIN_TOKEN_NOT_YET_VALID' };
    }
    if (expiresAt <= now) {
      return { valid: false, code: 'DESIGNER_LIVE_PREVIEW_ORIGIN_TOKEN_EXPIRED' };
    }
    const configuredOrigins = Array.isArray(securityConfig?.postMessage?.allowedOrigins)
      ? securityConfig.postMessage.allowedOrigins.filter(Boolean)
      : [];
    if (configuredOrigins.length && !origins.some(origin => configuredOrigins.includes(origin))) {
      return { valid: false, code: 'DESIGNER_LIVE_PREVIEW_ORIGIN_TOKEN_SCOPE_INVALID' };
    }
    return { valid: true, code: '', payload };
  } catch {
    return { valid: false, code: 'DESIGNER_LIVE_PREVIEW_ORIGIN_TOKEN_INVALID' };
  }
}

module.exports = {
  _internals: {
    base64UrlDecode,
    base64UrlEncode
  },
  createOriginToken,
  verifyOriginToken
};
