'use strict';

require('dotenv').config();

const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');
const {
  ensureMetadataDatabase,
  ensureMetadataSchema,
  metadataDbSelect,
  metadataDbUpdate
} = require('./metadataService');

const MODULE_NAME = 'metadataManager';
const MODULE_TYPE = 'core';
const VALID_TARGET_TYPES = new Set([
  'contentEntry',
  'mediaAttachment',
  'user',
  'comment',
  'source',
  'path',
  'global'
]);
const VALID_VALUE_TYPES = new Set(['string', 'text', 'number', 'boolean', 'json', 'date', 'url']);
const VALID_VISIBILITY = new Set(['public', 'private', 'hidden']);
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const CONTROL_CHAR_REPLACE_PATTERN = /[\x00-\x1F\x7F]/g;
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const JSON_SANITIZE_MAX_DEPTH = 8;
const JSON_SANITIZE_MAX_ARRAY_LENGTH = 200;
const JSON_SANITIZE_MAX_KEYS = 200;

function assertCorePayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[metadataManager] ${eventName} => invalid meltdown payload.`);
  }
}

function requirePermission(payload, permission) {
  if (payload?.decodedJWT && !hasPermission(payload.decodedJWT, permission)) {
    throw new Error(`Forbidden - missing permission: ${permission}`);
  }
}

function canManageMetadata(payload) {
  return !payload?.decodedJWT || hasPermission(payload.decodedJWT, 'metadata.manage');
}

function normalizeText(value = '', max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function normalizeKey(value = '', max = 160) {
  return normalizeText(value, max)
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeTargetType(value = 'source') {
  const direct = normalizeText(value || 'source', 80);
  if (VALID_TARGET_TYPES.has(direct)) return direct;
  const lowered = direct.toLowerCase();
  const alias = {
    entry: 'contentEntry',
    content: 'contentEntry',
    media: 'mediaAttachment',
    attachment: 'mediaAttachment'
  }[lowered];
  return alias || 'source';
}

function normalizeValueType(value = 'string') {
  const type = normalizeKey(value || 'string', 40);
  return VALID_VALUE_TYPES.has(type) ? type : 'string';
}

function normalizeVisibility(value = 'private') {
  const visibility = normalizeKey(value || 'private', 40);
  return VALID_VISIBILITY.has(visibility) ? visibility : 'private';
}

function normalizeLanguage(value = '') {
  return normalizeKey(value || '', 24);
}

function sanitizeJsonValue(value, depth = 0) {
  if (depth > JSON_SANITIZE_MAX_DEPTH) return null;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    return value
      .slice(0, JSON_SANITIZE_MAX_ARRAY_LENGTH)
      .map(item => sanitizeJsonValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const clean = {};
    for (const [key, item] of Object.entries(value).slice(0, JSON_SANITIZE_MAX_KEYS)) {
      if (UNSAFE_OBJECT_KEYS.has(key)) continue;
      const safeKey = normalizeText(key, 160).replace(CONTROL_CHAR_REPLACE_PATTERN, '');
      if (!safeKey) continue;
      clean[safeKey] = sanitizeJsonValue(item, depth + 1);
    }
    return clean;
  }
  return null;
}

function normalizeMetadataUrl(value) {
  const url = normalizeText(value, 1200);
  if (!url) return '';
  if (CONTROL_CHAR_PATTERN.test(url) || /\s/.test(url) || url.includes('\\') || url.startsWith('//')) {
    throw new Error('Metadata URL value is unsafe.');
  }
  if (url.startsWith('/') || url.startsWith('#') || url.startsWith('?')) {
    return url;
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return `/${url.replace(/^\/+/, '')}`;
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Metadata URL value is invalid.');
  }
  if (!['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) {
    throw new Error('Metadata URL value is unsafe.');
  }
  return parsed.toString();
}

function normalizeTarget(payload = {}) {
  if (payload.entryId || payload.contentEntryId || payload.entry_id) {
    return {
      targetType: 'contentEntry',
      targetId: String(payload.entryId || payload.contentEntryId || payload.entry_id)
    };
  }
  if (payload.attachmentId || payload.mediaId || payload.media_id) {
    return {
      targetType: 'mediaAttachment',
      targetId: String(payload.attachmentId || payload.mediaId || payload.media_id)
    };
  }
  if (payload.termId || payload.term_id) {
    throw new Error('Metadata target "taxonomyTerm" is no longer supported; use page hierarchy metadata instead.');
  }
  if (payload.userId || payload.user_id) {
    return { targetType: 'user', targetId: String(payload.userId || payload.user_id) };
  }
  if (payload.commentId || payload.comment_id) {
    return { targetType: 'comment', targetId: String(payload.commentId || payload.comment_id) };
  }
  if (payload.sourceModule && payload.sourceId) {
    return {
      targetType: 'source',
      targetId: `${normalizeText(payload.sourceModule, 120)}:${normalizeText(payload.sourceId, 160)}`
    };
  }

  const rawTargetType = payload.targetType || payload.target_type || 'source';
  if (String(rawTargetType || '').trim().toLowerCase() === 'taxonomyterm') {
    throw new Error('Metadata target "taxonomyTerm" is no longer supported; use page hierarchy metadata instead.');
  }
  const targetType = normalizeTargetType(rawTargetType);
  const targetId = targetType === 'global'
    ? normalizeText(payload.targetId || payload.target_id || 'default', 240)
    : normalizeText(payload.targetId || payload.target_id || '', 240);
  if (!targetId) {
    throw new Error('Metadata targetId is required.');
  }
  return { targetType, targetId };
}

function coerceValue(value, valueType = 'string') {
  const type = normalizeValueType(valueType);
  if (type === 'number') {
    const num = Number(value);
    if (Number.isNaN(num)) throw new Error('Metadata value must be a number.');
    return num;
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    const text = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(text)) return true;
    if (['0', 'false', 'no', 'off'].includes(text)) return false;
    throw new Error('Metadata value must be a boolean.');
  }
  if (type === 'json') {
    let parsed = value;
    if (typeof value === 'string') {
      try {
        parsed = JSON.parse(value);
      } catch {
        throw new Error('Metadata value must be valid JSON.');
      }
    }
    return sanitizeJsonValue(parsed ?? null);
  }
  if (type === 'date') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('Metadata value must be a date.');
    return date.toISOString();
  }
  if (type === 'url') {
    return normalizeMetadataUrl(value);
  }
  if (type === 'text') return normalizeText(value, 20000);
  return normalizeText(value, 1000);
}

function normalizeField(payload = {}) {
  const targetType = normalizeTargetType(payload.targetType || payload.target_type || 'source');
  const metaKey = normalizeKey(payload.metaKey || payload.meta_key || payload.key || '', 160);
  if (!metaKey) throw new Error('metaKey is required.');
  const valueType = normalizeValueType(payload.valueType || payload.value_type || 'string');
  return {
    targetType,
    metaKey,
    label: normalizeText(payload.label || metaKey, 240),
    description: normalizeText(payload.description || '', 1000),
    valueType,
    defaultValue: typeof payload.defaultValue === 'undefined'
      ? null
      : coerceValue(payload.defaultValue, valueType),
    public: payload.public === true,
    multiple: payload.multiple === true,
    searchable: payload.searchable === true,
    settings: sanitizeJsonValue(payload.settings || {}),
    meta: sanitizeJsonValue(payload.meta || {})
  };
}

function normalizeFieldKey(payload = {}) {
  const targetType = normalizeTargetType(payload.targetType || payload.target_type || 'source');
  const metaKey = normalizeKey(payload.metaKey || payload.meta_key || payload.key || '', 160);
  if (!metaKey) throw new Error('metaKey is required.');
  return { targetType, metaKey };
}

function fieldValueType(field, fallback = 'string') {
  return normalizeValueType(field?.value_type || field?.valueType || fallback);
}

async function getFieldDefinition(motherEmitter, jwt, payload) {
  const target = normalizeTarget(payload);
  const key = {
    targetType: payload.targetType || payload.target_type
      ? normalizeTargetType(payload.targetType || payload.target_type)
      : target.targetType,
    metaKey: normalizeKey(payload.metaKey || payload.meta_key || payload.key || '', 160)
  };
  if (!key.metaKey) return null;
  const field = await metadataDbSelect(motherEmitter, jwt, 'GET_META_FIELD', key);
  return Array.isArray(field) ? field[0] || null : field || null;
}

function normalizeMetadataValue(payload = {}, field = null) {
  const target = normalizeTarget(payload);
  const metaKey = normalizeKey(payload.metaKey || payload.meta_key || payload.key || '', 160);
  if (!metaKey) throw new Error('metaKey is required.');
  const valueType = normalizeValueType(payload.valueType || payload.value_type || fieldValueType(field));
  return {
    ...target,
    metaKey,
    language: normalizeLanguage(payload.language || ''),
    value: coerceValue(payload.value, valueType),
    valueType,
    visibility: normalizeVisibility(payload.visibility || (field?.public ? 'public' : 'private')),
    sourceModule: normalizeText(payload.sourceModule || payload.source_module || '', 120),
    sourceId: normalizeText(payload.sourceId || payload.source_id || '', 160),
    meta: sanitizeJsonValue(payload.meta || {})
  };
}

function normalizeMetadataQuery(payload = {}, manager = false) {
  const target = normalizeTarget(payload);
  return {
    ...target,
    metaKey: payload.metaKey || payload.meta_key || payload.key
      ? normalizeKey(payload.metaKey || payload.meta_key || payload.key, 160)
      : '',
    language: payload.language ? normalizeLanguage(payload.language) : '',
    visibility: manager ? (payload.visibility ? normalizeVisibility(payload.visibility) : '') : 'public',
    limit: Math.min(Number(payload.limit) || 100, 250),
    offset: Math.max(Number(payload.offset) || 0, 0)
  };
}

function parseRecordValue(record) {
  if (!record) return record;
  const valueType = fieldValueType(record);
  const raw = record.value;
  if (valueType === 'json') {
    if (typeof raw !== 'string') return { ...record, value: sanitizeJsonValue(raw) };
    try {
      return { ...record, value: sanitizeJsonValue(JSON.parse(raw)) };
    } catch {
      return { ...record, value: null };
    }
  }
  if (valueType === 'number') return { ...record, value: Number(raw) };
  if (valueType === 'boolean') return { ...record, value: raw === true || raw === 1 || raw === 'true' || raw === '1' };
  if (typeof raw === 'string' && /^".*"$/.test(raw)) {
    try {
      return { ...record, value: JSON.parse(raw) };
    } catch {
      return record;
    }
  }
  return record;
}

function parseRecords(records) {
  return (Array.isArray(records) ? records : [records]).filter(Boolean).map(parseRecordValue);
}

function setupMetadataEvents(motherEmitter) {
  motherEmitter.on('registerMetaField', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'registerMetaField');
      requirePermission(payload, 'metadata.manage');
      const result = await metadataDbUpdate(motherEmitter, payload.jwt, 'UPSERT_META_FIELD', normalizeField(payload));
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getMetaField', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'getMetaField');
      const result = await metadataDbSelect(motherEmitter, payload.jwt, 'GET_META_FIELD', normalizeFieldKey(payload));
      const field = Array.isArray(result) ? result[0] || null : result || null;
      if (!canManageMetadata(payload) && field && field.public !== true) {
        callback(null, null);
        return;
      }
      callback(null, field);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('listMetaFields', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'listMetaFields');
      const manager = canManageMetadata(payload);
      const result = await metadataDbSelect(motherEmitter, payload.jwt, 'LIST_META_FIELDS', {
        targetType: payload.targetType ? normalizeTargetType(payload.targetType) : '',
        public: manager ? (typeof payload.public === 'boolean' ? payload.public : null) : true,
        limit: Math.min(Number(payload.limit) || 100, 250),
        offset: Math.max(Number(payload.offset) || 0, 0)
      });
      callback(null, result || []);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('deleteMetaField', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'deleteMetaField');
      requirePermission(payload, 'metadata.manage');
      const result = await metadataDbUpdate(motherEmitter, payload.jwt, 'DELETE_META_FIELD', normalizeFieldKey(payload));
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('setMetadata', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'setMetadata');
      requirePermission(payload, 'metadata.manage');
      const field = await getFieldDefinition(motherEmitter, payload.jwt, payload);
      const result = await metadataDbUpdate(
        motherEmitter,
        payload.jwt,
        'UPSERT_METADATA_VALUE',
        normalizeMetadataValue(payload, field)
      );
      callback(null, parseRecordValue(result));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getMetadata', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'getMetadata');
      const result = await metadataDbSelect(
        motherEmitter,
        payload.jwt,
        'GET_METADATA_VALUES',
        normalizeMetadataQuery(payload, canManageMetadata(payload))
      );
      callback(null, parseRecords(result));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getMetadataValue', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'getMetadataValue');
      const query = normalizeMetadataQuery(payload, canManageMetadata(payload));
      if (!query.metaKey) throw new Error('metaKey is required.');
      const result = await metadataDbSelect(motherEmitter, payload.jwt, 'GET_METADATA_VALUES', {
        ...query,
        limit: 1
      });
      const record = parseRecords(result)[0] || null;
      callback(null, record ? record.value : null);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('deleteMetadata', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'deleteMetadata');
      requirePermission(payload, 'metadata.manage');
      const result = await metadataDbUpdate(
        motherEmitter,
        payload.jwt,
        'DELETE_METADATA_VALUE',
        normalizeMetadataQuery(payload, true)
      );
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('deleteMetadataForTarget', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'deleteMetadataForTarget');
      requirePermission(payload, 'metadata.manage');
      const result = await metadataDbUpdate(
        motherEmitter,
        payload.jwt,
        'DELETE_METADATA_FOR_TARGET',
        normalizeTarget(payload)
      );
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });
}

module.exports = {
  async initialize({ motherEmitter, isCore, jwt, nonce }) {
    if (!isCore) {
      throw new Error('[METADATA MANAGER] Must be loaded as a core module.');
    }
    if (!jwt) {
      throw new Error('[METADATA MANAGER] initialization requires a valid JWT token.');
    }
    if (!motherEmitter) {
      throw new Error('[METADATA MANAGER] motherEmitter missing.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    console.log('[METADATA MANAGER] Initializing Metadata Manager...');
    await ensureMetadataDatabase(motherEmitter, jwt, nonce);
    await ensureMetadataSchema(motherEmitter, jwt);
    setupMetadataEvents(motherEmitter);
    console.log('[METADATA MANAGER] Initialized successfully.');
  },
  setupMetadataEvents,
  _internals: {
    coerceValue,
    normalizeField,
    normalizeMetadataUrl,
    normalizeMetadataQuery,
    normalizeMetadataValue,
    normalizeTarget,
    parseRecordValue,
    sanitizeJsonValue
  }
};
