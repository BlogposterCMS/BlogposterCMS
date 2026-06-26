'use strict';

require('dotenv').config();

const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');
const {
  ensureSearchDatabase,
  ensureSearchSchema,
  searchDbSelect,
  searchDbUpdate
} = require('./searchService');

const MODULE_NAME = 'searchManager';
const MODULE_TYPE = 'core';
const VALID_STATUSES = new Set(['draft', 'review', 'scheduled', 'published', 'private', 'archived', 'deleted']);
const VALID_VISIBILITY = new Set(['public', 'private', 'hidden']);
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/g;
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const META_MAX_DEPTH = 6;
const META_MAX_KEYS = 100;
const META_MAX_ARRAY_LENGTH = 100;

function assertCorePayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[searchManager] ${eventName} => invalid meltdown payload.`);
  }
}

function requirePermission(payload, permission) {
  if (payload?.decodedJWT && !hasPermission(payload.decodedJWT, permission)) {
    throw new Error(`Forbidden - missing permission: ${permission}`);
  }
}

function canManageSearch(payload) {
  return !payload?.decodedJWT || hasPermission(payload.decodedJWT, 'search.manage');
}

function normalizeText(value = '', max = 20000) {
  return String(value || '').replace(CONTROL_CHAR_PATTERN, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeKey(value = '', max = 160) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max);
}

function normalizeStatus(value = 'published') {
  const status = String(value || 'published').toLowerCase();
  return VALID_STATUSES.has(status) ? status : 'published';
}

function normalizeVisibility(value = 'public') {
  const visibility = String(value || 'public').toLowerCase();
  return VALID_VISIBILITY.has(visibility) ? visibility : 'public';
}

function stripHtml(value = '') {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
      const safeKey = normalizeText(key, 160);
      if (!safeKey) continue;
      clean[safeKey] = sanitizeMetaValue(item, depth + 1);
    }
    return clean;
  }
  return null;
}

function normalizeSearchUrl(value = '') {
  const url = normalizeText(value, 1000);
  if (!url) return '';
  if (/\s/.test(url) || url.includes('\\') || url.startsWith('//')) return '';
  if (url.startsWith('/') || url.startsWith('#') || url.startsWith('?')) return url;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return `/${url.replace(/^\/+/, '')}`;
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return '';
  }
  return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
}

function contentToText(content = {}) {
  if (typeof content === 'string') return stripHtml(content);
  if (!content || typeof content !== 'object') return '';
  const pieces = [];
  for (const key of ['body', 'html', 'text', 'excerpt']) {
    if (content[key]) pieces.push(stripHtml(content[key]));
  }
  if (Array.isArray(content.translations)) {
    for (const translation of content.translations) {
      pieces.push(stripHtml(translation?.html || ''));
      pieces.push(stripHtml(translation?.title || ''));
    }
  }
  return pieces.filter(Boolean).join(' ');
}

function normalizeSource(payload = {}) {
  if (payload.entryId || payload.entry_id) {
    const entryId = String(payload.entryId || payload.entry_id);
    return { sourceModule: 'contentEngine', sourceId: entryId, entryId };
  }
  const sourceModule = normalizeText(payload.sourceModule || payload.source_module || '', 120);
  const sourceId = normalizeText(payload.sourceId || payload.source_id || '', 160);
  if (!sourceModule || !sourceId) {
    throw new Error('sourceModule/sourceId or entryId is required.');
  }
  return {
    sourceModule,
    sourceId,
    entryId: payload.entryId || payload.entry_id || null
  };
}

function normalizeSearchDocument(payload = {}, fallback = {}) {
  const source = normalizeSource({ ...fallback, ...payload });
  const title = normalizeText(payload.title ?? fallback.title ?? '', 300);
  const excerpt = normalizeText(payload.excerpt ?? fallback.excerpt ?? '', 1000);
  const body = normalizeText(stripHtml(payload.body ?? payload.searchText ?? payload.search_text ?? fallback.body ?? fallback.search_text ?? ''), 20000);
  const url = normalizeSearchUrl(payload.url ?? payload.permalink ?? fallback.url ?? fallback.permalink ?? '');
  const contentTypeKey = normalizeKey(payload.contentTypeKey || payload.content_type_key || fallback.content_type_key || fallback.contentTypeKey || '', 120);
  const status = normalizeStatus(payload.status ?? fallback.status ?? 'published');
  const visibility = normalizeVisibility(payload.visibility ?? fallback.visibility ?? (status === 'published' ? 'public' : 'private'));
  const language = normalizeKey(payload.language || fallback.language || 'en', 20) || 'en';
  const searchText = normalizeText([title, excerpt, body, contentTypeKey, url].filter(Boolean).join(' '), 30000);

  if (!title && !body && !excerpt) {
    throw new Error('Search document needs title, excerpt or body text.');
  }

  return {
    ...source,
    contentTypeKey,
    title,
    excerpt,
    body,
    url,
    language,
    status,
    visibility,
    searchText,
    meta: sanitizeMetaValue(payload.meta ?? fallback.meta ?? {})
  };
}

function contentEntryToSearchDocument(entry = {}) {
  const content = entry.content || {};
  const meta = entry.meta || {};
  const body = contentToText(content);
  return normalizeSearchDocument({
    entryId: entry.id,
    contentTypeKey: entry.content_type_key || entry.contentTypeKey,
    title: entry.title,
    excerpt: entry.excerpt || meta.metaDesc || meta.description || '',
    body,
    url: entry.permalink,
    language: entry.language || 'en',
    status: entry.status || 'draft',
    visibility: entry.status === 'published' ? 'public' : 'private',
    meta: {
      source: 'contentEngine',
      contentTypeKey: entry.content_type_key || entry.contentTypeKey
    }
  });
}

function normalizeQuery(value = '') {
  return normalizeText(value, 300);
}

function setupSearchEvents(motherEmitter) {
  motherEmitter.on('indexSearchDocument', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'indexSearchDocument');
      requirePermission(payload, 'search.manage');
      const result = await searchDbUpdate(motherEmitter, payload.jwt, 'UPSERT_SEARCH_DOCUMENT', normalizeSearchDocument(payload));
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getSearchDocument', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'getSearchDocument');
      const result = await searchDbSelect(motherEmitter, payload.jwt, 'GET_SEARCH_DOCUMENT', normalizeSource(payload));
      callback(null, Array.isArray(result) ? result[0] || null : result || null);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('removeSearchDocument', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'removeSearchDocument');
      requirePermission(payload, 'search.manage');
      const result = await searchDbUpdate(motherEmitter, payload.jwt, 'DELETE_SEARCH_DOCUMENT', normalizeSource(payload));
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('searchDocuments', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'searchDocuments');
      const manager = canManageSearch(payload);
      const result = await searchDbSelect(motherEmitter, payload.jwt, 'SEARCH_DOCUMENTS', {
        query: normalizeQuery(payload.query || payload.q || ''),
        contentTypeKey: normalizeKey(payload.contentTypeKey || payload.contentType || ''),
        language: payload.language ? normalizeKey(payload.language, 20) : '',
        status: manager ? (payload.status ? normalizeStatus(payload.status) : '') : 'published',
        visibility: manager ? (payload.visibility ? normalizeVisibility(payload.visibility) : '') : 'public',
        limit: Math.min(Number(payload.limit) || 20, 100),
        offset: Math.max(Number(payload.offset) || 0, 0)
      });
      callback(null, result || []);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('reindexContentEntries', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'reindexContentEntries');
      requirePermission(payload, 'search.manage');
      const entries = await new Promise((resolve, reject) => {
        motherEmitter.emit('listContentEntries', {
          jwt: payload.jwt,
          moduleName: 'contentEngine',
          moduleType: 'core',
          contentTypeKey: payload.contentTypeKey || payload.contentType || '',
          status: payload.status || 'published',
          language: payload.language || '',
          limit: Math.min(Number(payload.limit) || 100, 100),
          offset: Math.max(Number(payload.offset) || 0, 0)
        }, (err, result) => (err ? reject(err) : resolve(result || [])));
      });
      const indexed = [];
      const errors = [];
      for (const entry of entries) {
        try {
          indexed.push(await searchDbUpdate(motherEmitter, payload.jwt, 'UPSERT_SEARCH_DOCUMENT', contentEntryToSearchDocument(entry)));
        } catch (err) {
          errors.push({ entryId: entry.id, message: err.message });
        }
      }
      callback(null, { count: indexed.length, indexed, errors });
    } catch (err) {
      callback(err);
    }
  });
}

module.exports = {
  async initialize({ motherEmitter, isCore, jwt, nonce }) {
    if (!isCore) {
      throw new Error('[SEARCH MANAGER] Must be loaded as a core module.');
    }
    if (!jwt) {
      throw new Error('[SEARCH MANAGER] initialization requires a valid JWT token.');
    }
    if (!motherEmitter) {
      throw new Error('[SEARCH MANAGER] motherEmitter missing.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    console.log('[SEARCH MANAGER] Initializing Search Manager...');
    await ensureSearchDatabase(motherEmitter, jwt, nonce);
    await ensureSearchSchema(motherEmitter, jwt);
    setupSearchEvents(motherEmitter);
    console.log('[SEARCH MANAGER] Initialized successfully.');
  },
  setupSearchEvents,
  _internals: {
    contentEntryToSearchDocument,
    contentToText,
    normalizeSearchDocument,
    normalizeSearchUrl,
    normalizeSource,
    sanitizeMetaValue,
    stripHtml
  }
};
