'use strict';

require('dotenv').config();

const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');
const {
  contentDbSelect,
  contentDbUpdate,
  ensureContentEngineDatabase,
  ensureContentEngineSchema,
  seedDefaultContentTypes
} = require('./contentService');

const MODULE_NAME = 'contentEngine';
const MODULE_TYPE = 'core';
const VALID_STATUSES = new Set(['draft', 'review', 'scheduled', 'published', 'private', 'archived', 'deleted']);
const OPTIONAL_SEARCH_TIMEOUT_MS = 1000;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/g;
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const JSON_MAX_DEPTH = 18;
const JSON_MAX_KEYS = 500;
const JSON_MAX_ARRAY_LENGTH = 1000;
const JSON_STRING_MAX_LENGTH = 250000;

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
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object' || typeof value === 'function' || typeof value === 'symbol') return null;
  return normalizeSingleLineText(value, max) || null;
}

function normalizeScalarText(value, max = 160) {
  const clean = normalizeScalarId(value, max);
  return clean === null ? '' : String(clean);
}

function sanitizeSlug(raw, fallback = 'entry') {
  const slug = normalizeSingleLineText(raw || fallback, 260)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('/')
    .map(seg => seg.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('/')
    .substring(0, 160);
  return slug || fallback;
}

function normalizeKey(raw, fallback = '') {
  return normalizeSingleLineText(raw || fallback, 160)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeStatus(raw, fallback = 'draft') {
  const status = String(raw || fallback).toLowerCase();
  return VALID_STATUSES.has(status) ? status : fallback;
}

function normalizeLanguage(raw = 'en') {
  return normalizeKey(raw || 'en', 'en').slice(0, 32) || 'en';
}

function normalizeModuleName(raw = '') {
  const clean = normalizeSingleLineText(raw, 120);
  return /^[A-Za-z0-9_-]+$/.test(clean) ? clean : '';
}

function normalizeIconName(raw = '') {
  return normalizeSingleLineText(raw, 80).replace(/[^A-Za-z0-9_-]/g, '');
}

function normalizePositiveInteger(value, fallback = null) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.trunc(number);
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

function normalizePermalinkPath(raw = '') {
  const value = normalizeSingleLineText(raw, 1000);
  if (!value) return '';
  if (value === '/') return '/';
  if (value.includes('\\') || value.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(value)) return '';
  const pathOnly = value.split(/[?#]/, 1)[0];
  const segments = pathOnly
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .map(segment => sanitizeSlug(segment, ''))
    .filter(Boolean);
  return segments.length ? `/${segments.join('/')}` : '';
}

function buildPermalink({ contentTypeKey, slug, parentPermalink = '', permalink = '' }) {
  if (permalink) {
    const explicit = normalizePermalinkPath(permalink);
    if (explicit) return explicit;
  }

  const cleanSlug = sanitizeSlug(slug);
  const parent = normalizePermalinkPath(parentPermalink);
  if (parent && parent !== '/') return `${parent}/${cleanSlug}`;
  if (parent === '/') return `/${cleanSlug}`;

  if (contentTypeKey === 'page') return `/${cleanSlug}`;
  return `/${sanitizeSlug(contentTypeKey, 'content')}/${cleanSlug}`;
}

function assertCorePayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[contentEngine] ${eventName} => invalid meltdown payload.`);
  }
}

function requirePermission(payload, permission) {
  if (payload?.decodedJWT && !hasPermission(payload.decodedJWT, permission)) {
    throw new Error(`Forbidden - missing permission: ${permission}`);
  }
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
    const proto = Object.getPrototypeOf(value);
    if (proto && proto !== Object.prototype) return {};
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

function normalizeContentPayload(value, fallback = {}) {
  if (typeof value === 'undefined') return sanitizeJsonValue(fallback ?? {});
  return sanitizeJsonValue(value);
}

function normalizeObjectPayload(value, fallback = {}) {
  const source = typeof value === 'undefined' ? fallback : parseJsonishString(value, fallback);
  const clean = sanitizeJsonValue(source ?? {});
  return clean && typeof clean === 'object' && !Array.isArray(clean) ? clean : {};
}

function normalizeArrayPayload(value, fallback = []) {
  const source = typeof value === 'undefined' ? fallback : parseJsonishString(value, fallback);
  const clean = sanitizeJsonValue(source ?? []);
  return Array.isArray(clean) ? clean : [];
}

function normalizeDateString(value, fallback = null) {
  const raw = normalizeSingleLineText(value || '', 80);
  if (!raw) return fallback;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function emitOptional(motherEmitter, eventName, payload) {
  return new Promise(resolve => {
    if (typeof motherEmitter.listenerCount === 'function' && motherEmitter.listenerCount(eventName) === 0) {
      return resolve({ skipped: true });
    }

    let settled = false;
    let timer = null;
    const finish = value => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };

    timer = setTimeout(() => finish({ skipped: true, reason: 'timeout' }), OPTIONAL_SEARCH_TIMEOUT_MS);
    try {
      const emitted = motherEmitter.emit(eventName, payload, onceCallback((err, result) => {
        finish({ err: err || null, result });
      }));
      if (!emitted) finish({ skipped: true });
    } catch (err) {
      finish({ err });
    }
  });
}

function stripHtml(value = '') {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function contentToSearchBody(content = {}) {
  if (typeof content === 'string') return stripHtml(content);
  if (!content || typeof content !== 'object') return '';
  const pieces = [];
  for (const key of ['body', 'html', 'text', 'excerpt']) {
    if (content[key]) pieces.push(stripHtml(content[key]));
  }
  if (Array.isArray(content.translations)) {
    for (const translation of content.translations) {
      pieces.push(stripHtml(translation?.title || ''));
      pieces.push(stripHtml(translation?.html || ''));
    }
  }
  return pieces.filter(Boolean).join(' ');
}

function buildSearchDocumentPayload(jwt, entry = {}) {
  const entryId = entry.id || entry.entryId;
  if (!entryId) return null;
  const content = entry.content || {};
  const meta = entry.meta || {};
  return {
    jwt,
    moduleName: 'searchManager',
    moduleType: 'core',
    entryId,
    contentTypeKey: entry.contentTypeKey || entry.content_type_key || '',
    title: entry.title || '',
    excerpt: entry.excerpt || meta.metaDesc || meta.description || '',
    body: contentToSearchBody(content),
    url: entry.permalink || '',
    language: entry.language || 'en',
    status: entry.status || 'draft',
    visibility: entry.status === 'published' ? 'public' : 'private',
    meta: {
      source: 'contentEngine',
      contentTypeKey: entry.contentTypeKey || entry.content_type_key || ''
    }
  };
}

async function mirrorContentEntryToSearch(motherEmitter, jwt, entry) {
  const payload = buildSearchDocumentPayload(jwt, entry);
  if (!payload) return;
  const result = await emitOptional(motherEmitter, 'indexSearchDocument', payload);
  if (result?.err) {
    console.warn('[CONTENT ENGINE] Search index mirror failed:', result.err.message);
  }
}

async function removeContentEntryFromSearch(motherEmitter, jwt, entryId) {
  if (!entryId) return;
  const result = await emitOptional(motherEmitter, 'removeSearchDocument', {
    jwt,
    moduleName: 'searchManager',
    moduleType: 'core',
    entryId
  });
  if (result?.err) {
    console.warn('[CONTENT ENGINE] Search index removal failed:', result.err.message);
  }
}

function normalizeEntryInput(payload, existing = {}) {
  const contentTypeKey = normalizeKey(firstDefined(payload.contentTypeKey, payload.contentType, existing.content_type_key), 'page');
  const title = normalizeSingleLineText(payload.title ?? existing.title ?? '', 300);
  const slug = sanitizeSlug(firstDefined(payload.slug, title, existing.slug, contentTypeKey));
  const parentPermalink = payload.parentPermalink ?? existing.parent_permalink ?? '';
  const permalink = buildPermalink({
    contentTypeKey,
    slug,
    parentPermalink,
    permalink: payload.permalink ?? existing.permalink ?? ''
  });

  return {
    id: normalizeScalarId(firstDefined(payload.entryId, payload.id, existing.id)),
    contentTypeKey,
    slug,
    permalink,
    status: normalizeStatus(payload.status ?? existing.status, existing.status || 'draft'),
    title,
    language: normalizeLanguage(payload.language || existing.language || 'en'),
    parentId: normalizeScalarId(firstDefined(payload.parentId, payload.parent_id, existing.parent_id)),
    sourceModule: normalizeModuleName(firstDefined(payload.sourceModule, payload.source_module, existing.source_module, '')) || null,
    sourceId: normalizeScalarText(firstDefined(payload.sourceId, payload.source_id, existing.source_id, ''), 160) || null,
    authorId: normalizeScalarId(firstDefined(payload.authorId, payload.author_id, existing.author_id)),
    excerpt: normalizeText(payload.excerpt ?? existing.excerpt ?? '', 2000),
    content: normalizeContentPayload(payload.content, existing.content ?? {}),
    meta: normalizeObjectPayload(payload.meta, existing.meta ?? {}),
    publishedAt: normalizeDateString(firstDefined(payload.publishedAt, payload.published_at, existing.published_at), null)
  };
}

function sameContentEntryId(left, right) {
  if (left == null || right == null) return false;
  return String(left) === String(right);
}

async function assertContentEntryAddressAvailable(motherEmitter, jwt, entry) {
  if (
    typeof motherEmitter.listenerCount === 'function' &&
    motherEmitter.listenerCount('dbSelect') === 0
  ) {
    return;
  }
  const conflict = await contentDbSelect(motherEmitter, jwt, 'FIND_CONTENT_ENTRY_CONFLICT', {
    entryId: entry.id || null,
    contentTypeKey: entry.contentTypeKey,
    slug: entry.slug,
    permalink: entry.permalink,
    language: entry.language
  });
  const row = Array.isArray(conflict) ? conflict[0] : conflict;
  if (!row) return;
  const rowId = row.id || row._id || row.entryId || row.entry_id;
  if (entry.id && sameContentEntryId(rowId, entry.id)) return;
  if (row.permalink === entry.permalink) {
    throw new Error(`Content permalink already exists: ${entry.permalink}`);
  }
  throw new Error(`Content slug already exists for ${entry.contentTypeKey}/${entry.language}: ${entry.slug}`);
}

function setupContentEngineEvents(motherEmitter) {
  motherEmitter.on('registerContentType', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'registerContentType');
      requirePermission(payload, 'content.types.manage');
      const key = normalizeKey(payload.key);
      if (!key) throw new Error('Content type key is required.');

      const result = await contentDbUpdate(motherEmitter, payload.jwt, 'UPSERT_CONTENT_TYPE', {
        key,
        label: normalizeSingleLineText(payload.label || key, 160),
        description: normalizeText(payload.description || '', 2000),
        icon: normalizeIconName(payload.icon || ''),
        fields: normalizeArrayPayload(payload.fields, []),
        settings: normalizeObjectPayload(payload.settings, {})
      });
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getContentType', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'getContentType');
      const key = normalizeKey(payload.key);
      if (!key) throw new Error('Content type key is required.');
      const result = await contentDbSelect(motherEmitter, payload.jwt, 'GET_CONTENT_TYPE', { key });
      callback(null, Array.isArray(result) ? result[0] || null : result || null);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('listContentTypes', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'listContentTypes');
      const result = await contentDbSelect(motherEmitter, payload.jwt, 'LIST_CONTENT_TYPES', {});
      callback(null, result || []);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('createContentEntry', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'createContentEntry');
      requirePermission(payload, 'content.create');
      const entry = normalizeEntryInput(payload);
      if (!entry.title) throw new Error('Content title is required.');
      await assertContentEntryAddressAvailable(motherEmitter, payload.jwt, entry);
      const result = await contentDbUpdate(motherEmitter, payload.jwt, 'CREATE_CONTENT_ENTRY', entry);
      await mirrorContentEntryToSearch(motherEmitter, payload.jwt, { ...entry, id: result?.entryId });
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('updateContentEntry', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'updateContentEntry');
      requirePermission(payload, 'content.update');
      const entryId = normalizeScalarId(firstDefined(payload.entryId, payload.id));
      if (!entryId) throw new Error('entryId is required.');
      const existing = await contentDbSelect(motherEmitter, payload.jwt, 'GET_CONTENT_ENTRY', { entryId });
      const current = Array.isArray(existing) ? existing[0] : existing;
      if (!current) throw new Error('Content entry not found.');
      const entry = normalizeEntryInput(payload, current);
      await assertContentEntryAddressAvailable(motherEmitter, payload.jwt, entry);
      const result = await contentDbUpdate(motherEmitter, payload.jwt, 'UPDATE_CONTENT_ENTRY', entry);
      await mirrorContentEntryToSearch(motherEmitter, payload.jwt, { ...entry, id: entry.id || entryId });
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('publishContentEntry', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'publishContentEntry');
      requirePermission(payload, 'content.publish');
      motherEmitter.emit('updateContentEntry', {
        ...payload,
        status: 'published',
        publishedAt: payload.publishedAt || new Date().toISOString()
      }, callback);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getContentEntry', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'getContentEntry');
      const entryId = normalizeScalarId(firstDefined(payload.entryId, payload.id));
      if (!entryId) throw new Error('entryId is required.');
      const result = await contentDbSelect(motherEmitter, payload.jwt, 'GET_CONTENT_ENTRY', { entryId });
      callback(null, Array.isArray(result) ? result[0] || null : result || null);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getContentEntryBySource', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'getContentEntryBySource');
      const sourceModule = normalizeModuleName(firstDefined(payload.sourceModule, payload.source_module, ''));
      const sourceId = normalizeScalarText(firstDefined(payload.sourceId, payload.source_id, ''), 160);
      if (!sourceModule || !sourceId) throw new Error('sourceModule and sourceId are required.');
      const result = await contentDbSelect(motherEmitter, payload.jwt, 'GET_CONTENT_ENTRY_BY_SOURCE', {
        sourceModule,
        sourceId
      });
      callback(null, Array.isArray(result) ? result[0] || null : result || null);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('resolveContentPermalink', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'resolveContentPermalink');
      const permalink = normalizePermalinkPath(firstDefined(payload.permalink, payload.path, ''));
      if (!permalink) throw new Error('permalink or path is required.');
      const language = normalizeLanguage(payload.language || 'en');
      const result = await contentDbSelect(motherEmitter, payload.jwt, 'RESOLVE_CONTENT_PERMALINK', { permalink, language });
      callback(null, Array.isArray(result) ? result[0] || null : result || null);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('listContentEntries', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'listContentEntries');
      const result = await contentDbSelect(motherEmitter, payload.jwt, 'LIST_CONTENT_ENTRIES', {
        contentTypeKey: normalizeKey(payload.contentTypeKey || payload.contentType || ''),
        status: payload.status ? normalizeStatus(payload.status) : '',
        language: payload.language ? normalizeLanguage(payload.language) : '',
        limit: normalizeLimit(payload.limit, 50, 100),
        offset: normalizeOffset(payload.offset)
      });
      callback(null, result || []);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('listTrashedContentEntries', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'listTrashedContentEntries');
      requirePermission(payload, 'content.delete');
      const result = await contentDbSelect(motherEmitter, payload.jwt, 'LIST_TRASHED_CONTENT_ENTRIES', {
        contentTypeKey: normalizeKey(payload.contentTypeKey || payload.contentType || ''),
        language: payload.language ? normalizeLanguage(payload.language) : '',
        limit: normalizeLimit(payload.limit, 50, 100),
        offset: normalizeOffset(payload.offset)
      });
      callback(null, result || []);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('listScheduledContentEntries', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'listScheduledContentEntries');
      requirePermission(payload, 'content.publish');
      const result = await contentDbSelect(motherEmitter, payload.jwt, 'LIST_SCHEDULED_CONTENT_ENTRIES', {
        contentTypeKey: normalizeKey(payload.contentTypeKey || payload.contentType || ''),
        language: payload.language ? normalizeLanguage(payload.language) : '',
        dueBefore: normalizeDateString(firstDefined(payload.dueBefore, payload.before), new Date().toISOString()),
        limit: normalizeLimit(payload.limit, 50, 100),
        offset: normalizeOffset(payload.offset)
      });
      callback(null, result || []);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('publishScheduledContentEntries', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'publishScheduledContentEntries');
      requirePermission(payload, 'content.publish');
      const due = await contentDbSelect(motherEmitter, payload.jwt, 'LIST_SCHEDULED_CONTENT_ENTRIES', {
        contentTypeKey: normalizeKey(payload.contentTypeKey || payload.contentType || ''),
        language: payload.language ? normalizeLanguage(payload.language) : '',
        dueBefore: normalizeDateString(firstDefined(payload.dueBefore, payload.before), new Date().toISOString()),
        limit: normalizeLimit(payload.limit, 50, 100),
        offset: 0
      }) || [];
      const published = [];
      const errors = [];

      for (const entry of due) {
        try {
          const result = await new Promise((resolve, reject) => {
            motherEmitter.emit('publishContentEntry', {
              ...payload,
              entryId: entry.id,
              publishedAt: new Date().toISOString()
            }, (err, value) => (err ? reject(err) : resolve(value)));
          });
          published.push(result);
        } catch (err) {
          errors.push({ entryId: entry.id, message: err.message });
        }
      }

      callback(null, { dueCount: due.length, publishedCount: published.length, published, errors });
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getContentRevisions', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'getContentRevisions');
      const entryId = normalizeScalarId(firstDefined(payload.entryId, payload.id));
      if (!entryId) throw new Error('entryId is required.');
      const result = await contentDbSelect(motherEmitter, payload.jwt, 'LIST_CONTENT_REVISIONS', { entryId });
      callback(null, result || []);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getContentRevision', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'getContentRevision');
      const revisionId = normalizeScalarId(firstDefined(payload.revisionId, payload.revision_id));
      const entryId = normalizeScalarId(firstDefined(payload.entryId, payload.id));
      const version = normalizePositiveInteger(payload.version);
      if (!revisionId && (!entryId || !version)) {
        throw new Error('revisionId or entryId/version is required.');
      }
      const result = await contentDbSelect(motherEmitter, payload.jwt, 'GET_CONTENT_REVISION', {
        revisionId,
        entryId,
        version
      });
      callback(null, Array.isArray(result) ? result[0] || null : result || null);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('restoreContentRevision', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'restoreContentRevision');
      requirePermission(payload, 'content.update');
      const revisionId = normalizeScalarId(firstDefined(payload.revisionId, payload.revision_id));
      const entryId = normalizeScalarId(firstDefined(payload.entryId, payload.id));
      const version = normalizePositiveInteger(payload.version);
      if (!revisionId && (!entryId || !version)) {
        throw new Error('revisionId or entryId/version is required.');
      }
      const result = await contentDbUpdate(motherEmitter, payload.jwt, 'RESTORE_CONTENT_REVISION', {
        revisionId,
        entryId,
        version,
        authorId: normalizeScalarId(firstDefined(payload.authorId, payload.userId))
      });
      const restoredEntryId = result?.entryId || result?.entry_id || entryId;
      if (restoredEntryId) {
        const restoredEntry = await contentDbSelect(motherEmitter, payload.jwt, 'GET_CONTENT_ENTRY', { entryId: restoredEntryId });
        await mirrorContentEntryToSearch(motherEmitter, payload.jwt, Array.isArray(restoredEntry) ? restoredEntry[0] : restoredEntry);
      }
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('trashContentEntry', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'trashContentEntry');
      requirePermission(payload, 'content.delete');
      const entryId = normalizeScalarId(firstDefined(payload.entryId, payload.id));
      if (!entryId) throw new Error('entryId is required.');
      const result = await contentDbUpdate(motherEmitter, payload.jwt, 'TRASH_CONTENT_ENTRY', {
        entryId,
        deletedBy: normalizeScalarId(firstDefined(payload.deletedBy, payload.userId))
      });
      await removeContentEntryFromSearch(motherEmitter, payload.jwt, entryId);
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('restoreContentEntry', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'restoreContentEntry');
      requirePermission(payload, 'content.restore');
      const entryId = normalizeScalarId(firstDefined(payload.entryId, payload.id));
      if (!entryId) throw new Error('entryId is required.');
      const requestedStatus = normalizeStatus(payload.status || 'draft', 'draft');
      const result = await contentDbUpdate(motherEmitter, payload.jwt, 'RESTORE_CONTENT_ENTRY', {
        entryId,
        status: requestedStatus === 'deleted' ? 'draft' : requestedStatus
      });
      await mirrorContentEntryToSearch(motherEmitter, payload.jwt, result);
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

}

module.exports = {
  async initialize({ motherEmitter, isCore, jwt, nonce }) {
    if (!isCore) {
      throw new Error('[CONTENT ENGINE] Must be loaded as a core module.');
    }
    if (!jwt) {
      throw new Error('[CONTENT ENGINE] initialization requires a valid JWT token.');
    }
    if (!motherEmitter) {
      throw new Error('[CONTENT ENGINE] motherEmitter missing.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    console.log('[CONTENT ENGINE] Initializing Content Engine...');
    await ensureContentEngineDatabase(motherEmitter, jwt, nonce);
    await ensureContentEngineSchema(motherEmitter, jwt);
    setupContentEngineEvents(motherEmitter);
    await seedDefaultContentTypes(motherEmitter, jwt);
    console.log('[CONTENT ENGINE] Initialized successfully.');
  },
  setupContentEngineEvents,
  _internals: {
    assertContentEntryAddressAvailable,
    buildPermalink,
    normalizeContentPayload,
    normalizeEntryInput,
    normalizeKey,
    normalizeObjectPayload,
    normalizePermalinkPath,
    sanitizeJsonValue,
    sanitizeSlug
  }
};
