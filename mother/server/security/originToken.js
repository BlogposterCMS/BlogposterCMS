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

module.exports = {
  _internals: {
    base64UrlEncode
  },
  createOriginToken
};
