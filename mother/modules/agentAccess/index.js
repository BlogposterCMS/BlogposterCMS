'use strict';

const crypto = require('crypto');
const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');

const MODULE_NAME = 'agentAccess';
const MODULE_TYPE = 'core';
const CODE_PREFIX = 'bp_agent';
const DEFAULT_CODE_TTL_SECONDS = 15 * 60;
const MAX_CODE_TTL_SECONDS = 60 * 60;
const DEFAULT_TOKEN_TTL_SECONDS = 15 * 60;
const MAX_TOKEN_TTL_SECONDS = 60 * 60;
const VALID_CODE_ID = /^[a-f0-9]{24}$/;
const VALID_CODE_SECRET = /^[A-Za-z0-9_-]{32,}$/;

const accessCodes = new Map();

function nowIso() {
  return new Date().toISOString();
}

function base64Url(bytes = 24) {
  return crypto.randomBytes(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function normalizeSingleLine(value = '', max = 240) {
  return String(value || '').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeScope(value = 'control') {
  const scope = normalizeSingleLine(value, 32).toLowerCase();
  return scope === 'view' ? 'view' : 'control';
}

function normalizeTtlSeconds(value, fallback, max = MAX_CODE_TTL_SECONDS) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.max(Math.trunc(number), 60), max);
}

function codeStatus(record, now = Date.now()) {
  if (record.revokedAt) return 'revoked';
  if (record.usedAt) return 'used';
  if (record.expiresAtMs <= now) return 'expired';
  return 'active';
}

function pruneExpiredCodes(now = Date.now()) {
  for (const [codeId, record] of accessCodes.entries()) {
    const expiredLongAgo = record.expiresAtMs + (24 * 60 * 60 * 1000) < now;
    if (expiredLongAgo || record.revokedAt || record.usedAt) {
      accessCodes.delete(codeId);
    }
  }
}

function sanitizeRecord(record, now = Date.now()) {
  return {
    codeId: record.codeId,
    label: record.label,
    scope: record.scope,
    status: codeStatus(record, now),
    createdByUserId: record.createdByUserId,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    usedAt: record.usedAt || null,
    revokedAt: record.revokedAt || null,
    tokenTtlSeconds: record.tokenTtlSeconds
  };
}

function parseCode(code = '') {
  const raw = normalizeSingleLine(code, 220);
  const match = raw.match(/^bp_agent_([a-f0-9]{24})_([A-Za-z0-9_-]{32,})$/);
  if (!match) {
    throw new Error('AGENT_ACCESS_INVALID_CODE: Invalid agent access code.');
  }
  const [, codeId, secret] = match;
  if (!VALID_CODE_ID.test(codeId) || !VALID_CODE_SECRET.test(secret)) {
    throw new Error('AGENT_ACCESS_INVALID_CODE: Invalid agent access code.');
  }
  return { codeId, secret };
}

function hashSecret(codeId, secret) {
  return crypto.createHash('sha256').update(`${codeId}:${secret}`).digest('hex');
}

function assertAgentAccessPayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[agentAccess] ${eventName} => invalid meltdown payload.`);
  }
}

function requireManagePermission(payload) {
  const decoded = payload?.decodedJWT;
  if (!decoded) return;
  if (
    hasPermission(decoded, 'agent.access.manage') ||
    hasPermission(decoded, 'agent.control') ||
    hasPermission(decoded, 'builder.manage')
  ) {
    return;
  }
  throw new Error('Forbidden - missing permission: agent.access.manage');
}

function creatorUserId(payload = {}) {
  const id = payload.decodedJWT?.userId || payload.decodedJWT?.user?.id || payload.decodedJWT?.sub || payload.userId;
  const normalized = normalizeSingleLine(id, 120);
  if (!normalized) {
    throw new Error('AGENT_ACCESS_MISSING_USER: Agent access codes require a user-backed admin token.');
  }
  return normalized;
}

function permissionsForScope(scope) {
  const agent = { view: true };
  if (scope === 'control') agent.control = true;
  return { agent };
}

function emitAsync(motherEmitter, eventName, payload) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(eventName, payload, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

async function issueAgentToken(motherEmitter, options = {}) {
  const authModuleSecret = options.authModuleSecret || process.env.AUTH_MODULE_INTERNAL_SECRET;
  if (!authModuleSecret) {
    throw new Error('AGENT_ACCESS_AUTH_SECRET_MISSING: AUTH_MODULE_INTERNAL_SECRET is required.');
  }
  const scope = normalizeScope(options.scope);
  const tokenTtlSeconds = normalizeTtlSeconds(
    options.tokenTtlSeconds,
    DEFAULT_TOKEN_TTL_SECONDS,
    MAX_TOKEN_TTL_SECONDS
  );
  const token = await emitAsync(motherEmitter, 'issueUserToken', {
    skipJWT: true,
    authModuleSecret,
    moduleName: 'auth',
    moduleType: 'core',
    userId: options.userId,
    role: 'agent',
    customRoles: ['agent'],
    customPermissions: permissionsForScope(scope),
    userTokenLifetime: `${tokenTtlSeconds}s`
  });
  return {
    token,
    tokenType: 'Bearer',
    scope,
    expiresInSeconds: tokenTtlSeconds
  };
}

async function getUserManagementToken(motherEmitter, authModuleSecret) {
  return emitAsync(motherEmitter, 'issueModuleToken', {
    skipJWT: true,
    authModuleSecret,
    moduleName: 'auth',
    moduleType: 'core',
    signAsModule: 'userManagement',
    trustLevel: 'high'
  });
}

async function findUserByUsername(motherEmitter, moduleToken, username) {
  return emitAsync(motherEmitter, 'getUserDetailsByUsername', {
    jwt: moduleToken,
    moduleName: 'userManagement',
    moduleType: 'core',
    username
  });
}

async function findFallbackDevUser(motherEmitter, moduleToken) {
  const users = await emitAsync(motherEmitter, 'getAllUsers', {
    jwt: moduleToken,
    moduleName: 'userManagement',
    moduleType: 'core'
  });
  const list = Array.isArray(users) ? users : [];
  return (
    list.find(user => user?.username === process.env.DEV_USER) ||
    list.find(user => user?.username === 'admin') ||
    list.find(user => user?.role === 'admin' || (Array.isArray(user?.roles) && user.roles.includes('admin'))) ||
    list[0] ||
    null
  );
}

function createAgentAccessCode(payload = {}) {
  assertAgentAccessPayload(payload, 'agentAccess.createCode');
  requireManagePermission(payload);
  pruneExpiredCodes();

  const scope = normalizeScope(payload.scope);
  const codeTtlSeconds = normalizeTtlSeconds(payload.ttlSeconds, DEFAULT_CODE_TTL_SECONDS);
  const tokenTtlSeconds = normalizeTtlSeconds(
    payload.tokenTtlSeconds,
    Math.min(codeTtlSeconds, DEFAULT_TOKEN_TTL_SECONDS),
    MAX_TOKEN_TTL_SECONDS
  );
  const codeId = crypto.randomBytes(12).toString('hex');
  const secret = base64Url(32);
  const createdAtMs = Date.now();
  const expiresAtMs = createdAtMs + (codeTtlSeconds * 1000);
  const label = normalizeSingleLine(payload.label || 'codex-local-15min', 120) || 'codex-local-15min';
  const record = {
    codeId,
    label,
    scope,
    codeHash: hashSecret(codeId, secret),
    createdByUserId: creatorUserId(payload),
    createdAt: new Date(createdAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresAtMs,
    tokenTtlSeconds,
    usedAt: null,
    revokedAt: null
  };

  accessCodes.set(codeId, record);

  return {
    ...sanitizeRecord(record),
    code: `${CODE_PREFIX}_${codeId}_${secret}`
  };
}

async function exchangeAgentAccessCode(motherEmitter, payload = {}, authModuleSecret) {
  const parsed = parseCode(payload.code);
  const record = accessCodes.get(parsed.codeId);
  const now = Date.now();

  if (!record || record.codeHash !== hashSecret(parsed.codeId, parsed.secret)) {
    throw new Error('AGENT_ACCESS_INVALID_CODE: Invalid agent access code.');
  }
  const status = codeStatus(record, now);
  if (status === 'expired') throw new Error('AGENT_ACCESS_CODE_EXPIRED: Agent access code expired.');
  if (status === 'used') throw new Error('AGENT_ACCESS_CODE_USED: Agent access code already used.');
  if (status === 'revoked') throw new Error('AGENT_ACCESS_CODE_REVOKED: Agent access code was revoked.');

  // Mark first, so a failing downstream token exchange cannot be replayed.
  record.usedAt = nowIso();

  const tokenResult = await issueAgentToken(motherEmitter, {
    authModuleSecret,
    userId: record.createdByUserId,
    scope: record.scope,
    tokenTtlSeconds: record.tokenTtlSeconds
  });

  return {
    ...tokenResult,
    codeId: record.codeId,
    label: record.label
  };
}

function listAgentAccessCodes(payload = {}) {
  assertAgentAccessPayload(payload, 'agentAccess.listCodes');
  requireManagePermission(payload);
  const now = Date.now();
  pruneExpiredCodes(now);
  return Array.from(accessCodes.values())
    .map(record => sanitizeRecord(record, now))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function revokeAgentAccessCode(payload = {}) {
  assertAgentAccessPayload(payload, 'agentAccess.revokeCode');
  requireManagePermission(payload);
  const codeId = normalizeSingleLine(payload.codeId, 64);
  if (!VALID_CODE_ID.test(codeId)) {
    throw new Error('AGENT_ACCESS_INVALID_CODE_ID: Invalid agent access code id.');
  }
  const record = accessCodes.get(codeId);
  if (!record) {
    throw new Error('AGENT_ACCESS_CODE_NOT_FOUND: Agent access code not found.');
  }
  record.revokedAt = nowIso();
  return sanitizeRecord(record);
}

async function createDevAgentSession(motherEmitter, payload = {}, authModuleSecret) {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';
  if (isProduction || process.env.DEV_AGENT_LOGIN === 'false' || payload.localRequest !== true) {
    throw new Error('AGENT_ACCESS_DEV_DISABLED: Local dev agent login is disabled.');
  }

  const username = normalizeSingleLine(payload.username || process.env.DEV_USER || 'admin', 120) || 'admin';
  const moduleToken = await getUserManagementToken(motherEmitter, authModuleSecret);
  const user = await findUserByUsername(motherEmitter, moduleToken, username)
    || await findFallbackDevUser(motherEmitter, moduleToken);
  if (!user?.id) {
    throw new Error(`AGENT_ACCESS_DEV_USER_NOT_FOUND: Local dev user "${username}" was not found.`);
  }

  const tokenResult = await issueAgentToken(motherEmitter, {
    authModuleSecret,
    userId: user.id,
    scope: payload.scope,
    tokenTtlSeconds: payload.tokenTtlSeconds
  });

  return {
    ...tokenResult,
    username: user.username || username
  };
}

function setupAgentAccessEvents(motherEmitter, options = {}) {
  const authModuleSecret = options.authModuleSecret || process.env.AUTH_MODULE_INTERNAL_SECRET;

  motherEmitter.on('agentAccess.createCode', (payload, cb) => {
    const callback = onceCallback(cb);
    try {
      callback(null, createAgentAccessCode(payload));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agentAccess.exchangeCode', async (payload, cb) => {
    const callback = onceCallback(cb);
    try {
      callback(null, await exchangeAgentAccessCode(motherEmitter, payload, authModuleSecret));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agentAccess.createDevSession', async (payload, cb) => {
    const callback = onceCallback(cb);
    try {
      callback(null, await createDevAgentSession(motherEmitter, payload, authModuleSecret));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agentAccess.listCodes', (payload, cb) => {
    const callback = onceCallback(cb);
    try {
      callback(null, listAgentAccessCodes(payload));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agentAccess.revokeCode', (payload, cb) => {
    const callback = onceCallback(cb);
    try {
      callback(null, revokeAgentAccessCode(payload));
    } catch (err) {
      callback(err);
    }
  });
}

function initialize({ motherEmitter, isCore, authModuleSecret } = {}) {
  if (!isCore) {
    throw new Error('[agentAccess] must be loaded as a core module.');
  }
  if (!motherEmitter || typeof motherEmitter.emit !== 'function') {
    throw new Error('[agentAccess] motherEmitter is required.');
  }
  if (typeof motherEmitter.registerModuleType === 'function') {
    motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
  }
  setupAgentAccessEvents(motherEmitter, { authModuleSecret });
}

function resetForTests() {
  accessCodes.clear();
}

module.exports = {
  initialize,
  setupAgentAccessEvents,
  _internals: {
    accessCodes,
    createAgentAccessCode,
    exchangeAgentAccessCode,
    listAgentAccessCodes,
    resetForTests,
    permissionsForScope
  }
};
