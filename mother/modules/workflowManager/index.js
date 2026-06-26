'use strict';

require('dotenv').config();

const crypto = require('crypto');
const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');
const {
  ensureWorkflowDatabase,
  ensureWorkflowSchema,
  workflowDbSelect,
  workflowDbUpdate
} = require('./workflowService');

const MODULE_NAME = 'workflowManager';
const MODULE_TYPE = 'core';
const VALID_TARGET_TYPES = new Set(['contentEntry', 'source', 'path']);
const VALID_REVIEW_STATUS = new Set(['pending', 'approved', 'rejected', 'cancelled']);
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/g;
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const JSON_MAX_DEPTH = 10;
const JSON_MAX_KEYS = 250;
const JSON_MAX_ARRAY_LENGTH = 500;
const JSON_STRING_MAX_LENGTH = 100000;

function assertCorePayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[workflowManager] ${eventName} => invalid meltdown payload.`);
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
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object' || typeof value === 'function' || typeof value === 'symbol') return '';
  return normalizeSingleLineText(value, max);
}

function normalizeModuleName(value = '') {
  const clean = normalizeSingleLineText(value, 120);
  return /^[A-Za-z0-9_-]+$/.test(clean) ? clean : '';
}

function normalizeLimit(value, fallback = 50, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.trunc(number), max);
}

function normalizeOffset(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.trunc(number);
}

function normalizeKey(value = '', max = 120) {
  return normalizeSingleLineText(value, max).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

function normalizeTargetType(value = 'source') {
  const raw = normalizeSingleLineText(value || 'source', 50);
  if (VALID_TARGET_TYPES.has(raw)) return raw;
  const alias = {
    entry: 'contentEntry',
    content: 'contentEntry'
  }[raw.toLowerCase()];
  return alias || 'source';
}

function normalizeTarget(payload = {}) {
  const entryId = normalizeScalarId(firstDefined(payload.entryId, payload.contentEntryId, payload.entry_id));
  if (entryId) {
    return {
      targetType: 'contentEntry',
      targetId: entryId
    };
  }
  const sourceModule = normalizeModuleName(payload.sourceModule || payload.source_module || '');
  const sourceId = normalizeScalarId(firstDefined(payload.sourceId, payload.source_id), 160);
  if (sourceModule && sourceId) {
    return {
      targetType: 'source',
      targetId: `${sourceModule}:${sourceId}`
    };
  }
  if (payload.path || payload.permalink || payload.url) {
    const targetId = normalizePath(payload.path || payload.permalink || payload.url);
    if (!targetId) throw new Error('Workflow path target is unsafe.');
    return {
      targetType: 'path',
      targetId
    };
  }
  const targetType = normalizeTargetType(payload.targetType || payload.target_type || 'source');
  const targetId = normalizeScalarId(firstDefined(payload.targetId, payload.target_id), 240);
  if (!targetId) throw new Error('Workflow targetId is required.');
  return { targetType, targetId };
}

function normalizePath(value = '/') {
  let path = normalizeSingleLineText(value || '/', 1000);
  if (path.includes('\\') || path.startsWith('//')) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
    if (!/^https?:\/\//i.test(path)) return '';
    try {
      path = new URL(path).pathname || '/';
    } catch {
      return '';
    }
  }
  path = path.split('#')[0].split('?')[0];
  if (!path || path === '/') return '/';
  return `/${path.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/')}`;
}

function actorId(payload = {}) {
  return normalizeScalarId(
    payload.userId ||
    payload.user_id ||
    payload.authorId ||
    payload.author_id ||
    payload.decodedJWT?.user?.id ||
    payload.decodedJWT?.userId ||
    payload.decodedJWT?.id ||
    payload.decodedJWT?.sub ||
    '',
    160
  );
}

function actorName(payload = {}) {
  return normalizeSingleLineText(
    payload.userName ||
    payload.user_name ||
    payload.decodedJWT?.user?.displayName ||
    payload.decodedJWT?.user?.username ||
    payload.decodedJWT?.username ||
    '',
    240
  );
}

function isoNow() {
  return new Date().toISOString();
}

function expiresAt(ttlSeconds = 120, now = new Date()) {
  const ttl = Math.min(Math.max(Number(ttlSeconds) || 120, 30), 3600);
  return new Date(now.getTime() + ttl * 1000).toISOString();
}

function normalizeDateString(value, fallback = null) {
  const raw = normalizeSingleLineText(value || '', 80);
  if (!raw) return fallback;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function sanitizeJsonValue(value, depth = 0) {
  if (depth > JSON_MAX_DEPTH) return null;
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return normalizeText(value, JSON_STRING_MAX_LENGTH);
  if (Array.isArray(value)) {
    return value.slice(0, JSON_MAX_ARRAY_LENGTH).map(item => sanitizeJsonValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const clean = {};
    for (const [key, item] of Object.entries(value).slice(0, JSON_MAX_KEYS)) {
      if (UNSAFE_OBJECT_KEYS.has(key)) continue;
      const safeKey = normalizeSingleLineText(key, 160);
      if (!safeKey) continue;
      clean[safeKey] = sanitizeJsonValue(item, depth + 1);
    }
    return clean;
  }
  return null;
}

function parseJsonishString(value, fallback) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeObjectPayload(value, fallback = {}) {
  const source = typeof value === 'undefined' ? fallback : parseJsonishString(value, fallback);
  const clean = sanitizeJsonValue(source ?? {});
  return clean && typeof clean === 'object' && !Array.isArray(clean) ? clean : {};
}

function normalizeContentPayload(value, fallback = {}) {
  if (typeof value === 'undefined') return sanitizeJsonValue(fallback ?? {});
  return sanitizeJsonValue(value);
}

function lockToken() {
  return crypto.randomBytes(16).toString('hex');
}

function normalizeLock(payload = {}) {
  const target = normalizeTarget(payload);
  const ownerId = actorId(payload);
  if (!ownerId) throw new Error('Lock owner userId is required.');
  return {
    ...target,
    ownerId,
    ownerName: actorName(payload),
    token: normalizeScalarId(payload.token || payload.lockToken || lockToken(), 120),
    now: isoNow(),
    expiresAt: normalizeDateString(payload.expiresAt || payload.expires_at, expiresAt(payload.ttlSeconds || payload.ttl)),
    force: payload.force === true,
    meta: normalizeObjectPayload(payload.meta, {})
  };
}

function normalizeLockKey(payload = {}) {
  return {
    ...normalizeTarget(payload),
    ownerId: actorId(payload),
    token: normalizeScalarId(payload.token || payload.lockToken || '', 120),
    force: payload.force === true,
    now: isoNow()
  };
}

function normalizeAutosave(payload = {}) {
  const target = normalizeTarget(payload);
  const authorId = actorId(payload);
  if (!authorId) throw new Error('Autosave author userId is required.');
  return {
    ...target,
    authorId,
    title: normalizeSingleLineText(payload.title || '', 500),
    excerpt: normalizeText(payload.excerpt || '', 2000),
    content: normalizeContentPayload(payload.content, {}),
    meta: normalizeObjectPayload(payload.meta, {}),
    baseRevisionId: normalizeScalarId(firstDefined(payload.baseRevisionId, payload.base_revision_id)) || null,
    createdAt: normalizeDateString(payload.createdAt || payload.created_at, isoNow())
  };
}

function normalizeAutosaveQuery(payload = {}) {
  const id = normalizeScalarId(firstDefined(payload.id, payload.autosaveId, payload.autosave_id)) || null;
  const target = id ? {} : normalizeTarget(payload);
  return {
    id,
    ...target,
    authorId: actorId(payload),
    limit: normalizeLimit(payload.limit, 20, 100),
    offset: normalizeOffset(payload.offset)
  };
}

function normalizeReviewStatus(value = 'pending') {
  const status = normalizeKey(value || 'pending', 40);
  return VALID_REVIEW_STATUS.has(status) ? status : 'pending';
}

function normalizeReview(payload = {}) {
  const target = normalizeTarget(payload);
  const submittedBy = actorId(payload);
  if (!submittedBy) throw new Error('Review submitter userId is required.');
  return {
    ...target,
    status: 'pending',
    submittedBy,
    reviewerId: normalizeScalarId(firstDefined(payload.reviewerId, payload.reviewer_id)) || null,
    note: normalizeText(payload.note || payload.message || '', 2000),
    resolutionNote: '',
    meta: normalizeObjectPayload(payload.meta, {})
  };
}

function normalizeReviewQuery(payload = {}) {
  const id = normalizeScalarId(firstDefined(payload.id, payload.reviewId, payload.review_id)) || null;
  const target = id ? {} : normalizeTarget(payload);
  return {
    id,
    ...target,
    status: payload.status ? normalizeReviewStatus(payload.status) : '',
    submittedBy: normalizeScalarId(firstDefined(payload.submittedBy, payload.submitted_by)) || '',
    reviewerId: normalizeScalarId(firstDefined(payload.reviewerId, payload.reviewer_id)) || '',
    limit: normalizeLimit(payload.limit, 50, 100),
    offset: normalizeOffset(payload.offset)
  };
}

function normalizeReviewResolution(payload = {}, status) {
  return {
    ...normalizeReviewQuery(payload),
    status,
    reviewerId: actorId(payload) || normalizeScalarId(firstDefined(payload.reviewerId, payload.reviewer_id)) || '',
    resolutionNote: normalizeText(payload.resolutionNote || payload.note || payload.message || '', 2000),
    resolvedAt: isoNow()
  };
}

async function emitOptional(motherEmitter, eventName, payload) {
  if (typeof motherEmitter.listenerCount === 'function' && motherEmitter.listenerCount(eventName) === 0) {
    return null;
  }
  return await new Promise(resolve => {
    motherEmitter.emit(eventName, payload, (err, result) => {
      resolve(err ? { error: err.message } : result);
    });
  });
}

function optionalContentEntryTarget(payload) {
  try {
    const target = normalizeTarget(payload);
    return target.targetType === 'contentEntry' ? target : null;
  } catch {
    return null;
  }
}

async function updateContentStatusOptional(motherEmitter, jwt, payload, status) {
  const target = optionalContentEntryTarget(payload);
  if (!target) return null;
  return emitOptional(motherEmitter, 'updateContentEntry', {
    jwt,
    moduleName: 'contentEngine',
    moduleType: 'core',
    entryId: target.targetId,
    status
  });
}

async function publishContentOptional(motherEmitter, jwt, payload) {
  const target = optionalContentEntryTarget(payload);
  if (!target) return null;
  return emitOptional(motherEmitter, 'publishContentEntry', {
    jwt,
    moduleName: 'contentEngine',
    moduleType: 'core',
    entryId: target.targetId
  });
}

function setupWorkflowEvents(motherEmitter) {
  motherEmitter.on('acquireContentLock', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'acquireContentLock');
      requirePermission(payload, 'content.update');
      const result = await workflowDbUpdate(motherEmitter, payload.jwt, 'ACQUIRE_CONTENT_LOCK', normalizeLock(payload));
      if (result && result.locked === false) {
        callback(null, result);
        return;
      }
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('refreshContentLock', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'refreshContentLock');
      requirePermission(payload, 'content.update');
      const lock = normalizeLock(payload);
      const result = await workflowDbUpdate(motherEmitter, payload.jwt, 'REFRESH_CONTENT_LOCK', lock);
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('releaseContentLock', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'releaseContentLock');
      requirePermission(payload, 'content.update');
      const result = await workflowDbUpdate(motherEmitter, payload.jwt, 'RELEASE_CONTENT_LOCK', normalizeLockKey(payload));
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getContentLock', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'getContentLock');
      const result = await workflowDbSelect(motherEmitter, payload.jwt, 'GET_CONTENT_LOCK', {
        ...normalizeTarget(payload),
        now: isoNow()
      });
      callback(null, Array.isArray(result) ? result[0] || null : result || null);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('saveContentAutosave', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'saveContentAutosave');
      requirePermission(payload, 'content.update');
      const result = await workflowDbUpdate(motherEmitter, payload.jwt, 'UPSERT_CONTENT_AUTOSAVE', normalizeAutosave(payload));
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getContentAutosave', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'getContentAutosave');
      const result = await workflowDbSelect(motherEmitter, payload.jwt, 'GET_CONTENT_AUTOSAVE', normalizeAutosaveQuery(payload));
      callback(null, Array.isArray(result) ? result[0] || null : result || null);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('listContentAutosaves', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'listContentAutosaves');
      requirePermission(payload, 'content.update');
      const result = await workflowDbSelect(motherEmitter, payload.jwt, 'LIST_CONTENT_AUTOSAVES', normalizeAutosaveQuery(payload));
      callback(null, result || []);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('deleteContentAutosave', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'deleteContentAutosave');
      requirePermission(payload, 'content.update');
      const result = await workflowDbUpdate(motherEmitter, payload.jwt, 'DELETE_CONTENT_AUTOSAVE', normalizeAutosaveQuery(payload));
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('submitContentReview', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'submitContentReview');
      requirePermission(payload, 'content.update');
      const review = await workflowDbUpdate(motherEmitter, payload.jwt, 'UPSERT_CONTENT_REVIEW', normalizeReview(payload));
      const contentUpdate = payload.updateEntryStatus === false
        ? null
        : await updateContentStatusOptional(motherEmitter, payload.jwt, payload, 'review');
      callback(null, { review, contentUpdate });
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('approveContentReview', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'approveContentReview');
      requirePermission(payload, 'content.publish');
      const review = await workflowDbUpdate(
        motherEmitter,
        payload.jwt,
        'UPDATE_CONTENT_REVIEW_STATUS',
        normalizeReviewResolution(payload, 'approved')
      );
      const contentUpdate = payload.publish === false ? null : await publishContentOptional(motherEmitter, payload.jwt, payload);
      callback(null, { review, contentUpdate });
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('rejectContentReview', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'rejectContentReview');
      requirePermission(payload, 'content.publish');
      const review = await workflowDbUpdate(
        motherEmitter,
        payload.jwt,
        'UPDATE_CONTENT_REVIEW_STATUS',
        normalizeReviewResolution(payload, 'rejected')
      );
      const contentUpdate = payload.updateEntryStatus === false
        ? null
        : await updateContentStatusOptional(motherEmitter, payload.jwt, payload, normalizeKey(payload.nextStatus || 'draft', 40) || 'draft');
      callback(null, { review, contentUpdate });
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getContentReview', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'getContentReview');
      requirePermission(payload, 'content.publish');
      const result = await workflowDbSelect(motherEmitter, payload.jwt, 'GET_CONTENT_REVIEW', normalizeReviewQuery(payload));
      callback(null, Array.isArray(result) ? result[0] || null : result || null);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('listContentReviewQueue', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'listContentReviewQueue');
      requirePermission(payload, 'content.publish');
      const result = await workflowDbSelect(motherEmitter, payload.jwt, 'LIST_CONTENT_REVIEWS', {
        ...normalizeReviewQuery(payload),
        status: payload.status ? normalizeReviewStatus(payload.status) : 'pending'
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
      throw new Error('[WORKFLOW MANAGER] Must be loaded as a core module.');
    }
    if (!jwt) {
      throw new Error('[WORKFLOW MANAGER] initialization requires a valid JWT token.');
    }
    if (!motherEmitter) {
      throw new Error('[WORKFLOW MANAGER] motherEmitter missing.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    console.log('[WORKFLOW MANAGER] Initializing Workflow Manager...');
    await ensureWorkflowDatabase(motherEmitter, jwt, nonce);
    await ensureWorkflowSchema(motherEmitter, jwt);
    setupWorkflowEvents(motherEmitter);
    console.log('[WORKFLOW MANAGER] Initialized successfully.');
  },
  setupWorkflowEvents,
  _internals: {
    expiresAt,
    normalizeAutosave,
    normalizeAutosaveQuery,
    normalizeContentPayload,
    normalizeLock,
    normalizeObjectPayload,
    normalizePath,
    normalizeReview,
    normalizeReviewQuery,
    normalizeReviewResolution,
    normalizeTarget,
    sanitizeJsonValue
  }
};
