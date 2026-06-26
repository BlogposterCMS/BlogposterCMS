'use strict';

require('dotenv').config();

const crypto = require('crypto');
const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');
const {
  ensureRedirectDatabase,
  ensureRedirectSchema,
  redirectDbSelect,
  redirectDbUpdate
} = require('./redirectService');

const MODULE_NAME = 'redirectManager';
const MODULE_TYPE = 'core';
const VALID_STATUS_CODES = new Set([301, 302, 307, 308]);
const VALID_MATCH_TYPES = new Set(['exact', 'prefix', 'regex']);
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/g;
const URL_UNSAFE_PATTERN = /[\s\\\x00-\x1F\x7F]/;
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const META_MAX_DEPTH = 6;
const META_MAX_KEYS = 100;
const META_MAX_ARRAY_LENGTH = 100;

function assertCorePayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[redirectManager] ${eventName} => invalid meltdown payload.`);
  }
}

function requirePermission(payload, permission) {
  if (payload?.decodedJWT && !hasPermission(payload.decodedJWT, permission)) {
    throw new Error(`Forbidden - missing permission: ${permission}`);
  }
}

function normalizeText(value = '', max = 1000) {
  return String(value || '').replace(CONTROL_CHAR_PATTERN, ' ').trim().slice(0, max);
}

function normalizeSingleLineText(value = '', max = 1000) {
  return normalizeText(value, max).replace(/\s+/g, ' ').trim();
}

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '');
}

function normalizeScalarId(value, max = 160) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'object' || typeof value === 'function' || typeof value === 'symbol') return null;
  return normalizeSingleLineText(value, max) || null;
}

function normalizeLimit(value, fallback = 50, max = 200) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.trunc(number), max);
}

function normalizeOffset(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.trunc(number);
}

function normalizeLanguage(value = '') {
  return normalizeSingleLineText(value, 24).toLowerCase().replace(/[^a-z0-9_-]+/g, '');
}

function normalizeMatchType(value = 'exact') {
  const matchType = normalizeSingleLineText(value || 'exact', 20).toLowerCase();
  return VALID_MATCH_TYPES.has(matchType) ? matchType : 'exact';
}

function normalizeStatusCode(value = 301) {
  const code = Number(value) || 301;
  return VALID_STATUS_CODES.has(code) ? code : 301;
}

function normalizePath(value = '/') {
  let raw = normalizeSingleLineText(value || '/', 1000);
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) {
    raw = '/';
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      raw = new URL(raw).pathname || '/';
    } catch {
      raw = '/';
    }
  }
  raw = raw.split('#')[0].split('?')[0].trim();
  if (!raw || raw === '/') return '/';
  return `/${raw.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/')}`;
}

function normalizeRegexSource(value = '') {
  const source = normalizeText(value, 1000);
  if (!source) throw new Error('Regex redirect source is required.');
  try {
    // Validate only. The compiled expression is created during resolution.
    new RegExp(source);
  } catch (err) {
    throw new Error(`Invalid redirect regex: ${err.message}`);
  }
  return source;
}

function normalizeRedirectTarget(value = '/') {
  const target = normalizeSingleLineText(value || '/', 1200);
  const lower = target.toLowerCase();
  if (URL_UNSAFE_PATTERN.test(target) || /^(javascript|data|vbscript):/.test(lower) || target.startsWith('//')) {
    throw new Error('Unsafe redirect target.');
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      throw new Error('Invalid redirect target URL.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Redirect target URL must use http or https.');
    }
    return parsed.toString();
  }

  const hashIndex = target.indexOf('#');
  const hash = hashIndex >= 0 ? target.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
  const queryIndex = withoutHash.indexOf('?');
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex) : '';
  const path = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  return `${normalizePath(path || '/')}${query}${hash}`;
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sanitizeMetaValue(value, depth = 0) {
  if (depth > META_MAX_DEPTH) return null;
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return normalizeText(value, 2000);
  if (Array.isArray(value)) {
    return value.slice(0, META_MAX_ARRAY_LENGTH).map(item => sanitizeMetaValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const clean = {};
    for (const [key, item] of Object.entries(value).slice(0, META_MAX_KEYS)) {
      if (UNSAFE_OBJECT_KEYS.has(key)) continue;
      const safeKey = normalizeSingleLineText(key, 160);
      if (!safeKey) continue;
      clean[safeKey] = sanitizeMetaValue(item, depth + 1);
    }
    return clean;
  }
  return null;
}

function sanitizeRedirectMeta(value = {}) {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      return {};
    }
  }
  const clean = sanitizeMetaValue(source ?? {});
  return clean && typeof clean === 'object' && !Array.isArray(clean) ? clean : {};
}

function normalizeRedirectRule(payload = {}, fallback = {}) {
  const matchType = normalizeMatchType(payload.matchType ?? payload.match_type ?? fallback.match_type ?? fallback.matchType);
  const fromRaw = payload.fromPath ?? payload.from_path ?? payload.path ?? fallback.from_path ?? fallback.fromPath;
  const fromPath = matchType === 'regex' ? normalizeRegexSource(fromRaw) : normalizePath(fromRaw || '/');
  const toPath = normalizeRedirectTarget(payload.toPath ?? payload.to_path ?? payload.target ?? fallback.to_path ?? fallback.toPath ?? '/');
  const language = normalizeLanguage(payload.language ?? fallback.language ?? '');

  if (fromPath === toPath && matchType !== 'regex') {
    throw new Error('Redirect source and target cannot be identical.');
  }

  return {
    id: normalizeScalarId(firstDefined(payload.id, fallback.id)),
    fromPath,
    toPath,
    statusCode: normalizeStatusCode(payload.statusCode ?? payload.status_code ?? fallback.status_code ?? 301),
    matchType,
    priority: normalizeOffset(payload.priority ?? fallback.priority ?? 0),
    language,
    active: payload.active ?? fallback.active ?? true ? true : false,
    startAt: normalizeDate(payload.startAt ?? payload.start_at ?? fallback.start_at),
    endAt: normalizeDate(payload.endAt ?? payload.end_at ?? fallback.end_at),
    meta: sanitizeRedirectMeta(payload.meta ?? fallback.meta ?? {})
  };
}

function normalizeRuleKey(payload = {}) {
  const id = normalizeScalarId(payload.id);
  if (id) return { id };
  const matchType = normalizeMatchType(payload.matchType ?? payload.match_type ?? 'exact');
  const rawPath = payload.fromPath ?? payload.from_path ?? payload.path;
  return {
    fromPath: matchType === 'regex' ? normalizeRegexSource(rawPath) : normalizePath(rawPath || '/'),
    language: normalizeLanguage(payload.language || '')
  };
}

function hashUserAgent(value = '') {
  const text = normalizeText(value, 1000);
  if (!text) return '';
  return crypto.createHash('sha256').update(text).digest('hex');
}

function ruleMatches(rule, requestPath) {
  const matchType = rule.match_type || rule.matchType || 'exact';
  const fromPath = rule.from_path || rule.fromPath || '/';
  if (matchType === 'exact') return requestPath === fromPath;
  if (matchType === 'prefix') {
    if (requestPath === fromPath) return true;
    const base = fromPath.endsWith('/') ? fromPath : `${fromPath}/`;
    return requestPath.startsWith(base);
  }
  if (matchType === 'regex') {
    try {
      return new RegExp(fromPath).test(requestPath);
    } catch {
      return false;
    }
  }
  return false;
}

function isAbsoluteHttpUrl(value = '') {
  return /^https?:\/\//i.test(value);
}

function appendPathSuffix(target, suffix) {
  if (!suffix) return target;
  if (isAbsoluteHttpUrl(target)) {
    const url = new URL(target);
    url.pathname = `${url.pathname.replace(/\/+$/g, '')}/${suffix.replace(/^\/+/g, '')}`;
    return url.toString();
  }
  return normalizeRedirectTarget(`${target.replace(/\/+$/g, '')}/${suffix.replace(/^\/+/g, '')}`);
}

function buildRedirectTarget(rule, requestPath) {
  const matchType = rule.match_type || rule.matchType || 'exact';
  const fromPath = rule.from_path || rule.fromPath || '/';
  const toPath = rule.to_path || rule.toPath || '/';

  if (matchType === 'prefix') {
    const suffix = requestPath.slice(fromPath.length);
    const preserve = rule.meta?.preservePathSuffix !== false;
    return preserve ? appendPathSuffix(toPath, suffix) : normalizeRedirectTarget(toPath);
  }

  if (matchType === 'regex') {
    const replaced = requestPath.replace(new RegExp(fromPath), toPath);
    return normalizeRedirectTarget(replaced);
  }

  return normalizeRedirectTarget(toPath);
}

function publicRule(rule, requestPath) {
  const target = buildRedirectTarget(rule, requestPath);
  return {
    id: rule.id,
    ruleId: rule.id,
    fromPath: rule.from_path || rule.fromPath,
    toPath: rule.to_path || rule.toPath,
    target,
    statusCode: normalizeStatusCode(rule.status_code || rule.statusCode || 301),
    matchType: rule.match_type || rule.matchType || 'exact',
    priority: normalizeOffset(rule.priority || 0),
    language: rule.language || '',
    meta: sanitizeRedirectMeta(rule.meta || {})
  };
}

function setupRedirectEvents(motherEmitter) {
  motherEmitter.on('upsertRedirectRule', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'upsertRedirectRule');
      requirePermission(payload, 'redirects.manage');
      const result = await redirectDbUpdate(motherEmitter, payload.jwt, 'UPSERT_REDIRECT_RULE', normalizeRedirectRule(payload));
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getRedirectRule', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'getRedirectRule');
      requirePermission(payload, 'redirects.manage');
      const result = await redirectDbSelect(motherEmitter, payload.jwt, 'GET_REDIRECT_RULE', normalizeRuleKey(payload));
      callback(null, Array.isArray(result) ? result[0] || null : result || null);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('listRedirectRules', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'listRedirectRules');
      requirePermission(payload, 'redirects.manage');
      const result = await redirectDbSelect(motherEmitter, payload.jwt, 'LIST_REDIRECT_RULES', {
        matchType: payload.matchType ? normalizeMatchType(payload.matchType) : '',
        language: payload.language ? normalizeLanguage(payload.language) : '',
        active: typeof payload.active === 'boolean' ? payload.active : null,
        limit: normalizeLimit(payload.limit, 50, 200),
        offset: normalizeOffset(payload.offset)
      });
      callback(null, result || []);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('deleteRedirectRule', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'deleteRedirectRule');
      requirePermission(payload, 'redirects.manage');
      const result = await redirectDbUpdate(motherEmitter, payload.jwt, 'DELETE_REDIRECT_RULE', normalizeRuleKey(payload));
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('resolveRedirect', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'resolveRedirect');
      const requestPath = normalizePath(payload.path || payload.url || payload.fromPath || '/');
      const candidates = await redirectDbSelect(motherEmitter, payload.jwt, 'RESOLVE_REDIRECT', {
        path: requestPath,
        language: normalizeLanguage(payload.language || ''),
        now: new Date().toISOString(),
        limit: normalizeLimit(payload.candidateLimit, 200, 500)
      });
      const matched = (Array.isArray(candidates) ? candidates : [candidates]).filter(Boolean).find(rule => ruleMatches(rule, requestPath));
      if (!matched) {
        callback(null, null);
        return;
      }

      const resolved = publicRule(matched, requestPath);
      if (payload.recordHit !== false) {
        try {
          await redirectDbUpdate(motherEmitter, payload.jwt, 'RECORD_REDIRECT_HIT', {
            ruleId: matched.id,
            fromPath: requestPath,
            userAgentHash: hashUserAgent(payload.userAgent || payload.user_agent || ''),
            referer: normalizeText(payload.referer || payload.referrer || '', 1000)
          });
          resolved.hitRecorded = true;
        } catch (err) {
          resolved.hitRecorded = false;
          resolved.hitError = err.message;
        }
      }
      callback(null, resolved);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('recordRedirectHit', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'recordRedirectHit');
      const result = await redirectDbUpdate(motherEmitter, payload.jwt, 'RECORD_REDIRECT_HIT', {
        ruleId: normalizeScalarId(firstDefined(payload.ruleId, payload.id)),
        fromPath: normalizePath(payload.fromPath || payload.path || '/'),
        userAgentHash: hashUserAgent(payload.userAgent || payload.user_agent || ''),
        referer: normalizeText(payload.referer || payload.referrer || '', 1000)
      });
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('listRedirectHits', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'listRedirectHits');
      requirePermission(payload, 'redirects.manage');
      const result = await redirectDbSelect(motherEmitter, payload.jwt, 'LIST_REDIRECT_HITS', {
        ruleId: normalizeScalarId(firstDefined(payload.ruleId, payload.id)),
        fromPath: payload.fromPath || payload.path ? normalizePath(payload.fromPath || payload.path) : '',
        limit: normalizeLimit(payload.limit, 50, 200),
        offset: normalizeOffset(payload.offset)
      });
      callback(null, result || []);
    } catch (err) {
      callback(err);
    }
  });
}

module.exports = {
  async initialize({ motherEmitter, isCore, jwt, nonce }) {
    if (!isCore) {
      throw new Error('[REDIRECT MANAGER] Must be loaded as a core module.');
    }
    if (!jwt) {
      throw new Error('[REDIRECT MANAGER] initialization requires a valid JWT token.');
    }
    if (!motherEmitter) {
      throw new Error('[REDIRECT MANAGER] motherEmitter missing.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    console.log('[REDIRECT MANAGER] Initializing Redirect Manager...');
    await ensureRedirectDatabase(motherEmitter, jwt, nonce);
    await ensureRedirectSchema(motherEmitter, jwt);
    setupRedirectEvents(motherEmitter);
    console.log('[REDIRECT MANAGER] Initialized successfully.');
  },
  setupRedirectEvents,
  _internals: {
    buildRedirectTarget,
    hashUserAgent,
    normalizePath,
    normalizeRedirectRule,
    normalizeRedirectTarget,
    sanitizeRedirectMeta,
    ruleMatches
  }
};
