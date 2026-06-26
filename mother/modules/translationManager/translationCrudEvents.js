'use strict';

const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');

const MODULE_NAME = 'translationManager';
const MODULE_TYPE = 'core';
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/g;
const MAX_STRING_LENGTH = 8000;
const MAX_ARRAY_LENGTH = 80;
const MAX_OBJECT_KEYS = 80;
const MAX_JSON_DEPTH = 6;
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function assertTranslationPayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[translationManager] ${eventName} => invalid meltdown payload.`);
  }
}

function requirePermission(payload, permission) {
  if (payload?.decodedJWT && !hasPermission(payload.decodedJWT, permission)) {
    throw new Error(`Forbidden - missing permission: ${permission}`);
  }
}

function scalarString(value, fallback = '') {
  if (value == null) return String(fallback || '');
  const valueType = typeof value;
  if (valueType === 'object' || valueType === 'function' || valueType === 'symbol') {
    return String(fallback || '');
  }
  return String(value).replace(CONTROL_CHAR_PATTERN, ' ');
}

function normalizeScalarId(value = '') {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return scalarString(value, '').trim().slice(0, 160);
}

function normalizeScalarText(value = '') {
  return scalarString(value, '').trim().slice(0, 160);
}

function normalizeTextValue(value = '') {
  const text = scalarString(value, '');
  return text.length > MAX_STRING_LENGTH ? text.slice(0, MAX_STRING_LENGTH) : text;
}

function normalizeListLimit(value, fallback = 100, max = 200) {
  const numeric = Number(value);
  const base = Number.isFinite(numeric) ? numeric : fallback;
  return Math.min(Math.max(Math.trunc(base), 1), max);
}

function normalizeListOffset(value) {
  const numeric = Number(value);
  return Math.max(Number.isFinite(numeric) ? Math.trunc(numeric) : 0, 0);
}

function normalizeObjectKey(key = '') {
  const rawKey = scalarString(key, '').trim();
  if (!rawKey || UNSAFE_OBJECT_KEYS.has(rawKey)) return '';
  const normalized = rawKey.replace(/[^\w.:-]+/g, '_').slice(0, 80);
  if (!normalized || UNSAFE_OBJECT_KEYS.has(normalized)) return '';
  return normalized;
}

function sanitizeJsonish(value, depth = 0) {
  if (depth > MAX_JSON_DEPTH) return '[depth-limit]';
  if (value == null) return value;
  if (typeof value === 'string') return normalizeTextValue(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH)
      .map(item => sanitizeJsonish(item, depth + 1))
      .filter(item => typeof item !== 'undefined');
  }
  if (typeof value === 'object') {
    const result = {};
    for (const [key, entryValue] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
      const safeKey = normalizeObjectKey(key);
      if (!safeKey) continue;
      const sanitized = sanitizeJsonish(entryValue, depth + 1);
      if (typeof sanitized !== 'undefined') result[safeKey] = sanitized;
    }
    return result;
  }
  return undefined;
}

function normalizeLanguageCode(value = '') {
  return scalarString(value, '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 24);
}

function normalizeTextRef(payload = {}) {
  const textId = normalizeScalarId(payload.textId ?? payload.id) || null;
  const objectId = normalizeScalarId(payload.objectId ?? payload.object_id ?? payload.targetId ?? payload.entryId);
  const fieldName = normalizeScalarText(payload.fieldName ?? payload.field ?? payload.key);
  const languageCode = normalizeLanguageCode(payload.languageCode || payload.language || payload.lang);
  if (!textId && (!objectId || !fieldName || !languageCode)) {
    throw new Error('textId or objectId/fieldName/languageCode is required.');
  }
  return { textId, objectId, fieldName, languageCode };
}

function normalizeTextPayload(payload = {}) {
  const base = normalizeTextRef(payload);
  if (!base.textId && (!base.objectId || !base.fieldName || !base.languageCode)) {
    throw new Error('objectId, fieldName and languageCode are required.');
  }
  return {
    ...base,
    textValue: normalizeTextValue(payload.textValue ?? payload.newTextValue ?? payload.value ?? ''),
    status: normalizeScalarText(payload.status || 'published').toLowerCase(),
    meta: sanitizeJsonish(payload.meta && typeof payload.meta === 'object' && !Array.isArray(payload.meta) ? payload.meta : {}, 1) || {}
  };
}

function normalizeLanguagePayload(payload = {}) {
  const languageCode = normalizeLanguageCode(payload.languageCode || payload.language || payload.lang || payload.code);
  const languageName = normalizeScalarText(payload.languageName || payload.name || languageCode);
  if (!languageCode) throw new Error('languageCode is required.');
  return {
    languageCode,
    languageName: languageName || languageCode,
    locale: normalizeScalarText(payload.locale || languageCode),
    active: typeof payload.active === 'undefined' ? true : Boolean(payload.active),
    textDirection: normalizeScalarText(payload.textDirection || payload.direction || 'ltr').toLowerCase() === 'rtl' ? 'rtl' : 'ltr'
  };
}

function dbSelect(motherEmitter, jwt, rawSQL, params) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit('dbSelect', {
      jwt,
      moduleName: MODULE_NAME,
      moduleType: MODULE_TYPE,
      table: '__rawSQL__',
      data: { rawSQL, params }
    }, onceCallback((err, result) => (err ? reject(err) : resolve(result))));
  });
}

function dbUpdate(motherEmitter, jwt, rawSQL, params) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit('dbUpdate', {
      jwt,
      moduleName: MODULE_NAME,
      moduleType: MODULE_TYPE,
      table: '__rawSQL__',
      data: { rawSQL, params }
    }, onceCallback((err, result) => (err ? reject(err) : resolve(result))));
  });
}

function dbDelete(motherEmitter, jwt, rawSQL, params) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit('dbDelete', {
      jwt,
      moduleName: MODULE_NAME,
      moduleType: MODULE_TYPE,
      table: '__rawSQL__',
      where: { rawSQL, params }
    }, onceCallback((err, result) => (err ? reject(err) : resolve(result))));
  });
}

function firstOrNull(result) {
  return Array.isArray(result) ? result[0] || null : result || null;
}

function setupTranslationCrudEvents(motherEmitter) {
  console.log('[TRANSLATION MANAGER] Setting up translation CRUD meltdown events...');

  motherEmitter.on('createTranslatedText', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertTranslationPayload(payload, 'createTranslatedText');
      requirePermission(payload, 'translations.create');
      callback(null, await dbUpdate(motherEmitter, payload.jwt, 'UPSERT_TRANSLATED_TEXT', normalizeTextPayload(payload)));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('upsertTranslatedText', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertTranslationPayload(payload, 'upsertTranslatedText');
      requirePermission(payload, 'translations.update');
      callback(null, await dbUpdate(motherEmitter, payload.jwt, 'UPSERT_TRANSLATED_TEXT', normalizeTextPayload(payload)));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getTranslatedText', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertTranslationPayload(payload, 'getTranslatedText');
      requirePermission(payload, 'translations.read');
      callback(null, firstOrNull(await dbSelect(motherEmitter, payload.jwt, 'GET_TRANSLATED_TEXT', normalizeTextRef(payload))));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('listTranslatedTexts', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertTranslationPayload(payload, 'listTranslatedTexts');
      requirePermission(payload, 'translations.read');
      callback(null, await dbSelect(motherEmitter, payload.jwt, 'LIST_TRANSLATED_TEXTS', {
        objectId: normalizeScalarId(payload.objectId ?? payload.object_id ?? payload.targetId),
        fieldName: normalizeScalarText(payload.fieldName ?? payload.field),
        languageCode: normalizeLanguageCode(payload.languageCode || payload.language || payload.lang),
        status: normalizeScalarText(payload.status || '').toLowerCase(),
        limit: normalizeListLimit(payload.limit, 100, 200),
        offset: normalizeListOffset(payload.offset)
      }));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('updateTranslatedText', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertTranslationPayload(payload, 'updateTranslatedText');
      requirePermission(payload, 'translations.update');
      callback(null, await dbUpdate(motherEmitter, payload.jwt, 'UPDATE_TRANSLATED_TEXT', normalizeTextPayload(payload)));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('deleteTranslatedText', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertTranslationPayload(payload, 'deleteTranslatedText');
      requirePermission(payload, 'translations.delete');
      callback(null, await dbDelete(motherEmitter, payload.jwt, 'DELETE_TRANSLATED_TEXT', normalizeTextRef(payload)));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('addLanguage', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertTranslationPayload(payload, 'addLanguage');
      requirePermission(payload, 'translations.addLanguage');
      callback(null, await dbUpdate(motherEmitter, payload.jwt, 'UPSERT_TRANSLATION_LANGUAGE', normalizeLanguagePayload(payload)));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('upsertTranslationLanguage', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertTranslationPayload(payload, 'upsertTranslationLanguage');
      requirePermission(payload, 'translations.addLanguage');
      callback(null, await dbUpdate(motherEmitter, payload.jwt, 'UPSERT_TRANSLATION_LANGUAGE', normalizeLanguagePayload(payload)));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getTranslationLanguage', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertTranslationPayload(payload, 'getTranslationLanguage');
      requirePermission(payload, 'translations.listLanguages');
      const { languageCode } = normalizeLanguagePayload(payload);
      callback(null, firstOrNull(await dbSelect(motherEmitter, payload.jwt, 'GET_TRANSLATION_LANGUAGE', { languageCode })));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('listLanguages', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertTranslationPayload(payload, 'listLanguages');
      requirePermission(payload, 'translations.listLanguages');
      callback(null, await dbSelect(motherEmitter, payload.jwt, 'LIST_TRANSLATION_LANGUAGES', {
        active: typeof payload.active === 'undefined' ? '' : payload.active
      }));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('deleteTranslationLanguage', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertTranslationPayload(payload, 'deleteTranslationLanguage');
      requirePermission(payload, 'translations.delete');
      const { languageCode } = normalizeLanguagePayload(payload);
      callback(null, await dbDelete(motherEmitter, payload.jwt, 'DELETE_TRANSLATION_LANGUAGE', { languageCode }));
    } catch (err) {
      callback(err);
    }
  });
}

module.exports = {
  setupTranslationCrudEvents,
  _internals: {
    normalizeLanguageCode,
    normalizeLanguagePayload,
    normalizeListLimit,
    normalizeScalarId,
    sanitizeJsonish,
    normalizeTextPayload,
    normalizeTextRef
  }
};
