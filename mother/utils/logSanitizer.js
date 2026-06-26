'use strict';

const SENSITIVE_KEYS = /(password|token|secret|jwt)/i;

function sanitizeValue(val) {
  if (typeof val === 'string') {
    return val.replace(/[A-Za-z0-9]{16,}/g, '[REDACTED]');
  }
  return val;
}

function sanitize(obj) {
  if (obj && typeof obj === 'object') {
    const clone = Array.isArray(obj) ? [] : {};
    for (const [k, v] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.test(k)) {
        clone[k] = '[REDACTED]';
      } else {
        clone[k] = sanitize(v);
      }
    }
    return clone;
  }
  return sanitizeValue(obj);
}

module.exports = { sanitize };
