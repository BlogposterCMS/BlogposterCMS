'use strict';

require('dotenv').config();

const crypto = require('crypto');
const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');
const {
  commentsDbSelect,
  commentsDbUpdate,
  ensureCommentsDatabase,
  ensureCommentsSchema
} = require('./commentsService');

const MODULE_NAME = 'commentsManager';
const MODULE_TYPE = 'core';
const VALID_STATUSES = new Set(['pending', 'approved', 'spam', 'trash']);
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/g;
const URL_UNSAFE_PATTERN = /[\s\\\x00-\x1F\x7F]/;
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const META_MAX_DEPTH = 6;
const META_MAX_KEYS = 100;
const META_MAX_ARRAY_LENGTH = 100;

function assertCorePayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[commentsManager] ${eventName} => invalid meltdown payload.`);
  }
}

function requirePermission(payload, permission) {
  if (payload?.decodedJWT && !hasPermission(payload.decodedJWT, permission)) {
    throw new Error(`Forbidden - missing permission: ${permission}`);
  }
}

function canModerate(payload) {
  return !payload?.decodedJWT || hasPermission(payload.decodedJWT, 'comments.moderate');
}

function normalizeStatus(raw, fallback = 'pending') {
  const status = String(raw || fallback).toLowerCase();
  return VALID_STATUSES.has(status) ? status : fallback;
}

function normalizeEmail(email = '') {
  return normalizeSingleLineText(email, 320).toLowerCase();
}

function normalizeText(value = '', max = 2000) {
  return String(value || '').replace(CONTROL_CHAR_PATTERN, ' ').trim().slice(0, max);
}

function normalizeSingleLineText(value = '', max = 2000) {
  return normalizeText(value, max).replace(/\s+/g, ' ').trim();
}

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '');
}

function normalizeScalar(value = '', max = 160) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'object' || typeof value === 'function' || typeof value === 'symbol') return '';
  return normalizeSingleLineText(value, max);
}

function normalizeAuthorUrl(value = '') {
  const url = normalizeSingleLineText(value, 500);
  if (!url || URL_UNSAFE_PATTERN.test(url) || url.startsWith('//')) return '';
  if (url.startsWith('/')) return url;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return '';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return '';
  }
  return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString().slice(0, 500) : '';
}

function normalizeHash(value = '') {
  const hash = normalizeSingleLineText(value, 128).toLowerCase();
  return /^[a-f0-9]{64}$/.test(hash) ? hash : '';
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

function sanitizeCommentMeta(value = {}) {
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

function hashOptional(value = '') {
  const clean = normalizeSingleLineText(value, 160);
  if (!clean) return '';
  return crypto.createHash('sha256').update(clean).digest('hex');
}

function normalizeTarget(payload) {
  const entryId = normalizeScalar(firstDefined(payload.entryId, payload.contentEntryId, payload.entry_id), 160);
  const sourceModule = normalizeSingleLineText(firstDefined(payload.sourceModule, payload.source_module, ''), 120);
  const sourceId = normalizeSingleLineText(firstDefined(payload.sourceId, payload.source_id, ''), 160);
  if (!entryId && (!sourceModule || !sourceId)) {
    throw new Error('entryId or sourceModule/sourceId is required.');
  }
  return {
    entryId: entryId ? String(entryId) : null,
    sourceModule: sourceModule || null,
    sourceId: sourceId || null
  };
}

function normalizeCommentInput(payload, existing = {}) {
  const target = normalizeTarget({ ...existing, ...payload });
  const content = normalizeText(payload.content ?? existing.content, 10000);
  if (!content) throw new Error('Comment content is required.');
  const authorIpHash = normalizeHash(firstDefined(payload.authorIpHash, payload.author_ip_hash))
    || hashOptional(firstDefined(payload.authorIp, payload.ip, ''));

  return {
    id: normalizeScalar(firstDefined(payload.commentId, payload.id, existing.id), 160) || null,
    ...target,
    parentId: normalizeScalar(firstDefined(payload.parentId, payload.parent_id, existing.parent_id), 160) || null,
    authorUserId: normalizeScalar(firstDefined(payload.authorUserId, payload.author_user_id, existing.author_user_id), 160) || null,
    authorName: normalizeSingleLineText(firstDefined(payload.authorName, payload.author_name, existing.author_name, 'Anonymous'), 160) || 'Anonymous',
    authorEmail: normalizeEmail(firstDefined(payload.authorEmail, payload.author_email, existing.author_email, '')),
    authorUrl: normalizeAuthorUrl(firstDefined(payload.authorUrl, payload.author_url, existing.author_url, '')),
    authorIpHash,
    userAgent: normalizeSingleLineText(firstDefined(payload.userAgent, payload.user_agent, ''), 500),
    content,
    status: normalizeStatus(payload.status ?? existing.status, existing.status || 'pending'),
    meta: sanitizeCommentMeta(payload.meta ?? existing.meta ?? {})
  };
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function sanitizeCommentRecord(record) {
  if (!record || typeof record !== 'object') return record;
  const clean = { ...record };
  if (hasOwn(clean, 'meta')) clean.meta = sanitizeCommentMeta(clean.meta);
  if (hasOwn(clean, 'authorUrl')) clean.authorUrl = normalizeAuthorUrl(clean.authorUrl);
  if (hasOwn(clean, 'author_url')) clean.author_url = normalizeAuthorUrl(clean.author_url);
  if (hasOwn(clean, 'authorName')) clean.authorName = normalizeSingleLineText(clean.authorName || 'Anonymous', 160) || 'Anonymous';
  if (hasOwn(clean, 'author_name')) clean.author_name = normalizeSingleLineText(clean.author_name || 'Anonymous', 160) || 'Anonymous';
  if (hasOwn(clean, 'authorEmail')) clean.authorEmail = normalizeEmail(clean.authorEmail);
  if (hasOwn(clean, 'author_email')) clean.author_email = normalizeEmail(clean.author_email);
  if (hasOwn(clean, 'userAgent')) clean.userAgent = normalizeSingleLineText(clean.userAgent, 500);
  if (hasOwn(clean, 'user_agent')) clean.user_agent = normalizeSingleLineText(clean.user_agent, 500);
  return clean;
}

function sanitizeCommentResult(result) {
  return Array.isArray(result) ? result.map(sanitizeCommentRecord) : sanitizeCommentRecord(result);
}

function setupCommentsEvents(motherEmitter) {
  motherEmitter.on('createComment', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'createComment');
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'comments.create')) {
        throw new Error('Forbidden - missing permission: comments.create');
      }
      const comment = normalizeCommentInput({
        ...payload,
        status: canModerate(payload) ? payload.status : 'pending'
      });
      const result = await commentsDbUpdate(motherEmitter, payload.jwt, 'CREATE_COMMENT', comment);
      callback(null, sanitizeCommentResult(result));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getComment', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'getComment');
      const commentId = normalizeScalar(firstDefined(payload.commentId, payload.id), 160);
      if (!commentId) throw new Error('commentId is required.');
      const result = await commentsDbSelect(motherEmitter, payload.jwt, 'GET_COMMENT', { commentId });
      callback(null, sanitizeCommentRecord(Array.isArray(result) ? result[0] || null : result || null));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('listCommentsForEntry', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'listCommentsForEntry');
      const target = normalizeTarget(payload);
      const status = canModerate(payload)
        ? (payload.status ? normalizeStatus(payload.status, '') : '')
        : 'approved';
      const result = await commentsDbSelect(motherEmitter, payload.jwt, 'LIST_COMMENTS_FOR_ENTRY', {
        ...target,
        status,
        limit: Math.min(Number(payload.limit) || 50, 100),
        offset: Math.max(Number(payload.offset) || 0, 0)
      });
      callback(null, sanitizeCommentResult(result || []));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('updateComment', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'updateComment');
      requirePermission(payload, 'comments.edit');
      const commentId = normalizeScalar(firstDefined(payload.commentId, payload.id), 160);
      if (!commentId) throw new Error('commentId is required.');
      const existing = await commentsDbSelect(motherEmitter, payload.jwt, 'GET_COMMENT', { commentId });
      const current = Array.isArray(existing) ? existing[0] : existing;
      if (!current) throw new Error('Comment not found.');
      const comment = normalizeCommentInput({ ...payload, commentId }, current);
      const result = await commentsDbUpdate(motherEmitter, payload.jwt, 'UPDATE_COMMENT', comment);
      callback(null, sanitizeCommentResult(result));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('updateCommentStatus', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'updateCommentStatus');
      requirePermission(payload, 'comments.moderate');
      const commentId = normalizeScalar(firstDefined(payload.commentId, payload.id), 160);
      if (!commentId) throw new Error('commentId is required.');
      const result = await commentsDbUpdate(motherEmitter, payload.jwt, 'UPDATE_COMMENT_STATUS', {
        commentId,
        status: normalizeStatus(payload.status, 'pending')
      });
      callback(null, sanitizeCommentResult(result));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('deleteComment', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'deleteComment');
      requirePermission(payload, 'comments.delete');
      const commentId = normalizeScalar(firstDefined(payload.commentId, payload.id), 160);
      if (!commentId) throw new Error('commentId is required.');
      const result = await commentsDbUpdate(motherEmitter, payload.jwt, 'DELETE_COMMENT', { commentId });
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });
}

module.exports = {
  async initialize({ motherEmitter, isCore, jwt, nonce }) {
    if (!isCore) {
      throw new Error('[COMMENTS MANAGER] Must be loaded as a core module.');
    }
    if (!jwt) {
      throw new Error('[COMMENTS MANAGER] initialization requires a valid JWT token.');
    }
    if (!motherEmitter) {
      throw new Error('[COMMENTS MANAGER] motherEmitter missing.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    console.log('[COMMENTS MANAGER] Initializing Comments Manager...');
    await ensureCommentsDatabase(motherEmitter, jwt, nonce);
    await ensureCommentsSchema(motherEmitter, jwt);
    setupCommentsEvents(motherEmitter);
    console.log('[COMMENTS MANAGER] Initialized successfully.');
  },
  setupCommentsEvents,
  _internals: {
    normalizeCommentInput,
    normalizeAuthorUrl,
    sanitizeCommentMeta,
    sanitizeCommentResult,
    normalizeStatus,
    normalizeTarget
  }
};
