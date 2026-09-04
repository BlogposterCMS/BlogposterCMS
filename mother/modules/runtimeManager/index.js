'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');



const crypto = require('crypto');
const { hasPermission } = require('../userManagement/permissionUtils');
const {
  BACKEND_EVENT_CONTRACTS,
  requestBackendEvent
} = require('../../contracts/backendEventContracts');
const { registerEventContractHandler } = require('../../contracts/eventContract');

const MODULE_NAME = 'runtimeManager';
const MODULE_TYPE = 'core';
const DEFAULT_SCHEDULE_INTERVAL_MS = 60 * 1000;
const DEFAULT_SCHEDULE_LIMIT = 50;
const DEFAULT_PUBLIC_LIMIT = 25;
const MAX_PUBLIC_LIMIT = 100;
const MIN_PREVIEW_TTL_SECONDS = 30;
const DEFAULT_PREVIEW_TTL_SECONDS = 15 * 60;
const MAX_PREVIEW_TTL_SECONDS = 60 * 60;
const PRIVATE_META_KEY_FRAGMENTS = ['password', 'secret', 'token', 'private', 'permission', 'role'];
const PUBLIC_READ_PRINCIPAL = { permissions: {} };
const PUBLIC_COMMENT_PRINCIPAL = { permissions: { comments: { create: true } } };

const {
  adminApiDefinition,
  adminApiEventDefinition,
  publicRuntimeDefinition
} = require('./facades/registry');
const { createFacadeDispatchers } = require('./facades/dispatchers');
const REDIRECT_SKIP_PREFIXES = [
  '/admin',
  '/api',
  '/assets',
  '/build',
  '/ui',
  '/login',
  '/install',
  '/register',
  '/favicon.ico',
  '/plainspace',
  '/apps',
  '/fonts',
  '/widgets'
];

function once(originalCb) {
  let fired = false;
  return (...args) => {
    if (fired) return;
    fired = true;
    if (typeof originalCb === 'function') originalCb(...args);
  };
}



function assertRuntimePayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[runtimeManager] ${eventName} => invalid meltdown payload.`);
  }
}

function requirePayloadPermission(payload, permission) {
  if (!permission) return;
  if (payload?.decodedJWT && !hasPermission(payload.decodedJWT, permission)) {
    throw new Error(`Forbidden - missing permission: ${permission}`);
  }
}

function requireAdminPrincipal(payload) {
  if (!payload?.decodedJWT || payload.decodedJWT.isPublic === true) {
    throw new Error('Authentication required: admin principal missing.');
  }
}

async function emitOptionalAsync(motherEmitter, eventName, payload, fallback = null) {
  if (typeof motherEmitter.listenerCount === 'function' && motherEmitter.listenerCount(eventName) === 0) {
    return fallback;
  }

  try {
    return await requestBackendEvent(motherEmitter, eventName, payload);
  } catch {
    return fallback;
  }
}

function previewSecret() {
  return String(
    process.env.CONTENT_PREVIEW_SECRET ||
    process.env.JWT_SECRET ||
    process.env.SESSION_SECRET ||
    'blogposterdev-preview-secret'
  );
}

function clampPreviewTtl(value) {
  const ttl = Number(value) || DEFAULT_PREVIEW_TTL_SECONDS;
  return Math.min(Math.max(Math.floor(ttl), MIN_PREVIEW_TTL_SECONDS), MAX_PREVIEW_TTL_SECONDS);
}

function stripUndefined(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => typeof entryValue !== 'undefined'));
}

function signPreviewPayload(payload, secret = previewSecret()) {
  const encoded = Buffer.from(JSON.stringify(stripUndefined(payload))).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function timingSafeStringEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyPreviewToken(token, options = {}) {
  const raw = String(token || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Invalid preview token.');
  }

  const expected = crypto
    .createHmac('sha256', options.secret || previewSecret())
    .update(parts[0])
    .digest('base64url');
  if (!timingSafeStringEqual(expected, parts[1])) {
    throw new Error('Invalid preview token.');
  }

  let payload = null;
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid preview token.');
  }

  const now = Number(options.now || Math.floor(Date.now() / 1000));
  if (payload?.purpose !== 'content-preview' || Number(payload.exp || 0) <= now) {
    throw new Error('Expired preview token.');
  }
  return payload;
}

function baseUrlFromRequest(req) {
  const host = req.get?.('host') || req.headers?.host || 'localhost';
  const protocol = req.protocol || 'http';
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return 'http://localhost';
  }
}

function normalizePublicPath(raw = '/') {
  let value = String(raw || '/').trim();
  if (!value) return '/';

  try {
    if (/^https?:\/\//i.test(value)) {
      value = new URL(value).pathname || '/';
    }
  } catch {
    value = '/';
  }

  value = value.split(/[?#]/)[0] || '/';
  if (value === '/') return '/';
  return `/${value.replace(/^\/+|\/+$/g, '')}`;
}

function normalizePublicKey(raw = '') {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function parseLimit(value, fallback = DEFAULT_PUBLIC_LIMIT) {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(Math.floor(limit), MAX_PUBLIC_LIMIT);
}

function parseOffset(value) {
  const offset = Number(value);
  if (!Number.isFinite(offset) || offset <= 0) return 0;
  return Math.floor(offset);
}

function languageFromRequest(req, fallback = '') {
  return String(req.query?.lang || req.query?.language || fallback || '').trim().toLowerCase();
}

function publicPathFromRequest(req) {
  return req.query?.path || req.query?.permalink || req.query?.url || '';
}

function actorIdFromPayload(payload = {}) {
  return String(
    payload.userId ||
    payload.user_id ||
    payload.authorId ||
    payload.author_id ||
    payload.decodedJWT?.user?.id ||
    payload.decodedJWT?.userId ||
    payload.decodedJWT?.id ||
    payload.decodedJWT?.sub ||
    ''
  );
}

function previewTargetFromPayload(payload = {}) {
  if (payload.entryId || payload.contentEntryId || payload.entry_id) {
    return { entryId: String(payload.entryId || payload.contentEntryId || payload.entry_id) };
  }
  if (payload.sourceModule && payload.sourceId) {
    return {
      sourceModule: String(payload.sourceModule).trim().slice(0, 120),
      sourceId: String(payload.sourceId).trim().slice(0, 160)
    };
  }
  if (payload.path || payload.permalink || payload.url) {
    return { path: normalizePublicPath(payload.path || payload.permalink || payload.url) };
  }
  return null;
}

function isPublishedEntry(entry) {
  return entry && String(entry.status || '').toLowerCase() === 'published';
}

function isPublishedPublicPage(page) {
  return page &&
    String(page.status || '').toLowerCase() === 'published' &&
    String(page.lane || 'public').toLowerCase() === 'public';
}

function isDeletedEntry(entry) {
  return entry && (String(entry.status || '').toLowerCase() === 'deleted' || entry.deleted_at || entry.deletedAt);
}

function isPrivatePublicKey(key = '') {
  const lowered = String(key || '').toLowerCase();
  return !lowered ||
    lowered.startsWith('_') ||
    PRIVATE_META_KEY_FRAGMENTS.some(fragment => lowered.includes(fragment));
}

function publicMeta(meta = {}) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  return Object.fromEntries(Object.entries(meta).filter(([key]) => !isPrivatePublicKey(key)));
}

function toPublicPlainSpaceValue(value) {
  if (Array.isArray(value)) {
    return value
      .map(toPublicPlainSpaceValue)
      .filter(item => item !== null && typeof item !== 'undefined');
  }
  if (!value || typeof value !== 'object') return value;

  if (
    Object.prototype.hasOwnProperty.call(value, 'lane') &&
    String(value.lane || '').toLowerCase() !== 'public'
  ) {
    return null;
  }

  const output = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (isPrivatePublicKey(key)) continue;
    const safeValue = toPublicPlainSpaceValue(entryValue);
    if (safeValue !== null && typeof safeValue !== 'undefined') {
      output[key] = safeValue;
    }
  }
  return output;
}

function toPublicPlainSpaceData(data) {
  return toPublicPlainSpaceValue(data);
}

function toPublicEntry(entry = {}) {
  return {
    id: entry.id || entry.entryId || null,
    contentTypeKey: entry.contentTypeKey || entry.content_type_key || '',
    slug: entry.slug || '',
    permalink: entry.permalink || '',
    status: entry.status || '',
    title: entry.title || '',
    language: entry.language || '',
    parentId: entry.parentId ?? entry.parent_id ?? null,
    excerpt: entry.excerpt || '',
    content: entry.content || {},
    meta: publicMeta(entry.meta || {}),
    publishedAt: entry.publishedAt || entry.published_at || null,
    updatedAt: entry.updatedAt || entry.updated_at || null,
    createdAt: entry.createdAt || entry.created_at || null
  };
}

function normalizeRuntimeRows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.data)) return value.data;
  return value ? [value] : [];
}

function normalizeRuntimeSingle(value) {
  const rows = normalizeRuntimeRows(value);
  return rows[0] || null;
}

function toPublicPage(page = {}) {
  const meta = page.meta && typeof page.meta === 'object' && !Array.isArray(page.meta)
    ? page.meta
    : {};
  return {
    id: page.id ?? page.pageId ?? null,
    slug: page.slug || '',
    lane: 'public',
    status: page.status || '',
    title: page.title || page.trans_title || '',
    language: page.language || page.trans_lang || '',
    parentId: page.parentId ?? page.parent_id ?? null,
    parentSlug: page.parentSlug || page.parent_slug || '',
    html: page.html || '',
    css: page.css || '',
    js: page.js || '',
    meta: publicMeta(meta),
    metaDesc: page.metaDesc || page.meta_desc || '',
    seoTitle: page.seoTitle || page.seo_title || page.title || '',
    seoKeywords: page.seoKeywords || page.seo_keywords || '',
    is_content: Boolean(page.is_content),
    weight: Number(page.weight) || 0,
    updatedAt: page.updatedAt || page.updated_at || null,
    createdAt: page.createdAt || page.created_at || null
  };
}

function isTruthyFlag(value) {
  if (value === true || value === 1) return true;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value || '').trim().toLowerCase());
}

function publicDesignObject(result = {}) {
  return result?.design && typeof result.design === 'object' && !Array.isArray(result.design)
    ? result.design
    : result;
}

function isPublicDesignResult(result) {
  const design = publicDesignObject(result);
  if (!design || typeof design !== 'object' || Array.isArray(design)) return false;
  return !isTruthyFlag(design.is_draft ?? design.isDraft);
}

function toPublicDesignResult(result = {}) {
  const design = publicDesignObject(result);
  if (!design || typeof design !== 'object' || Array.isArray(design)) return null;
  const {
    owner_id: ownerIdSnake,
    ownerId,
    user_id: userIdSnake,
    userId,
    created_by: createdBySnake,
    createdBy,
    updated_by: updatedBySnake,
    updatedBy,
    ...publicDesign
  } = design;

  if (result?.design && typeof result === 'object' && !Array.isArray(result)) {
    return { ...result, design: publicDesign };
  }
  return publicDesign;
}

function toFiniteNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function publicJsonValue(value, depth = 0) {
  if (depth > 4) return undefined;
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map(item => publicJsonValue(item, depth + 1))
      .filter(item => item !== undefined);
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      const safeKey = String(key || '').trim();
      if (!safeKey || safeKey === '__proto__' || safeKey === 'constructor' || safeKey === 'prototype') continue;
      const safeValue = publicJsonValue(nested, depth + 1);
      if (safeValue !== undefined) out[safeKey] = safeValue;
    }
    return out;
  }
  return undefined;
}

function publicWidgetLayoutItem(item = {}) {
  const result = {
    instanceId: String(item.instanceId || ''),
    widgetId: String(item.widgetId || ''),
    xPercent: toFiniteNumber(item.xPercent, 0),
    yPercent: toFiniteNumber(item.yPercent, 0),
    wPercent: toFiniteNumber(item.wPercent, 0),
    hPercent: toFiniteNumber(item.hPercent, 0)
  };
  for (const key of ['zIndex', 'rotationDeg', 'opacity']) {
    if (item[key] != null) result[key] = toFiniteNumber(item[key], key === 'opacity' ? 1 : 0);
  }
  for (const key of ['html', 'css', 'js']) {
    if (typeof item[key] === 'string' && item[key]) result[key] = item[key];
  }
  const metadata = publicJsonValue(item.metadata);
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata) && Object.keys(metadata).length) {
    result.metadata = metadata;
  }
  return result;
}

function toPublicDesignerLayout(layout = {}) {
  const source = layout && typeof layout === 'object' && !Array.isArray(layout) ? layout : {};
  const grid = source.grid && typeof source.grid === 'object' && !Array.isArray(source.grid)
    ? source.grid
    : {};
  return {
    grid: {
      columns: toFiniteNumber(grid.columns, 12),
      cellHeight: toFiniteNumber(grid.cellHeight, 8)
    },
    items: Array.isArray(source.items)
      ? source.items
          .filter(item => item && typeof item === 'object' && !Array.isArray(item))
          .map(publicWidgetLayoutItem)
          .filter(item => item.instanceId && item.widgetId)
      : [],
    layoutRef: typeof source.layoutRef === 'string' ? source.layoutRef : undefined
  };
}

function toPreviewInfo(payload = {}, source = 'entry') {
  return {
    source,
    expiresAt: payload.exp ? new Date(Number(payload.exp) * 1000).toISOString() : null,
    issuedAt: payload.iat ? new Date(Number(payload.iat) * 1000).toISOString() : null,
    entryId: payload.entryId || null,
    revisionId: payload.revisionId || null,
    version: payload.version || null,
    autosaveId: payload.autosaveId || null
  };
}

function toPublicSearchDocument(doc = {}) {
  return {
    id: doc.id || doc.documentId || null,
    entryId: doc.entryId ?? doc.entry_id ?? null,
    sourceModule: doc.sourceModule || doc.source_module || '',
    sourceId: doc.sourceId || doc.source_id || '',
    contentTypeKey: doc.contentTypeKey || doc.content_type_key || '',
    title: doc.title || '',
    excerpt: doc.excerpt || '',
    url: doc.url || doc.permalink || '',
    language: doc.language || '',
    status: doc.status || '',
    visibility: doc.visibility || '',
    meta: publicMeta(doc.meta || {})
  };
}

function isPublicSearchDocument(doc) {
  return doc &&
    String(doc.status || '').toLowerCase() === 'published' &&
    String(doc.visibility || 'public').toLowerCase() === 'public';
}

function toPublicNavigationItem(item = {}) {
  const normalized = {
    id: item.id || item.itemId || null,
    parentId: item.parentId ?? item.parent_id ?? null,
    type: item.type || 'custom',
    title: item.title || '',
    url: item.url || '',
    target: item.target || '',
    rel: item.rel || '',
    cssClass: item.cssClass || item.css_class || '',
    position: Number(item.position) || 0,
    status: item.status || '',
    entryId: item.entryId ?? item.entry_id ?? null,
    sourceModule: item.sourceModule || item.source_module || '',
    sourceId: item.sourceId || item.source_id || '',
    meta: publicMeta(item.meta || {})
  };
  if (Array.isArray(item.children)) {
    normalized.children = item.children.map(toPublicNavigationItem);
  }
  return normalized;
}

function toPublicComment(comment = {}) {
  return {
    id: comment.id || comment.commentId || null,
    entryId: comment.entryId ?? comment.entry_id ?? null,
    sourceModule: comment.sourceModule || comment.source_module || '',
    sourceId: comment.sourceId || comment.source_id || '',
    parentId: comment.parentId ?? comment.parent_id ?? null,
    authorName: comment.authorName || comment.author_name || 'Anonymous',
    authorUrl: comment.authorUrl || comment.author_url || '',
    content: comment.content || '',
    status: comment.status || '',
    meta: publicMeta(comment.meta || {}),
    createdAt: comment.createdAt || comment.created_at || null,
    updatedAt: comment.updatedAt || comment.updated_at || null
  };
}

function isApprovedComment(comment) {
  return comment && String(comment.status || '').toLowerCase() === 'approved';
}

function activeNavigationItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter(item => String(item.status || 'active').toLowerCase() === 'active')
    .map(item => ({
      ...item,
      children: activeNavigationItems(item.children || [])
    }));
}

function toPublicMenu(menu = {}) {
  return {
    id: menu.id || menu.menuId || null,
    key: menu.key || menu.menuKey || '',
    label: menu.label || '',
    description: menu.description || '',
    locationKey: menu.locationKey || menu.location_key || ''
  };
}

function sendPublicNotFound(res, code = 'not_found') {
  res.status(404).json({ error: { code, message: 'Public resource not found.' } });
}

function sendPublicApiError(res, err) {
  const missingListener = /^Missing event listener:/.test(err?.message || '');
  const status = Number(err?.statusCode || err?.status) || (missingListener ? 503 : 500);
  const code = err?.code || (missingListener ? 'service_unavailable' : 'runtime_error');
  const message = status >= 500 ? 'Public runtime request failed.' : err.message;
  res.status(status).json({ error: { code, message } });
}

function publicCommentTargetFromRequest(req, body = {}) {
  const entryId = req.query?.entryId || req.query?.contentEntryId || body.entryId || body.contentEntryId || null;
  const sourceModule = req.query?.sourceModule || body.sourceModule || '';
  const sourceId = req.query?.sourceId || body.sourceId || '';
  if (entryId) return { entryId: String(entryId) };
  if (sourceModule && sourceId) {
    return {
      sourceModule: String(sourceModule).trim().slice(0, 120),
      sourceId: String(sourceId).trim().slice(0, 160)
    };
  }
  return null;
}

function shouldCheckRedirect(req) {
  if (!req || !['GET', 'HEAD'].includes(String(req.method || '').toUpperCase())) return false;
  const requestPath = req.path || '/';
  return !REDIRECT_SKIP_PREFIXES.some(prefix =>
    requestPath === prefix || requestPath.startsWith(`${prefix}/`)
  );
}

function normalizeRedirectStatus(value) {
  const status = Number(value) || 301;
  return [301, 302, 303, 307, 308].includes(status) ? status : 301;
}

async function isMaintenanceMode(motherEmitter, jwt) {
  try {
    const value = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_SETTING, {
      jwt,
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'MAINTENANCE_MODE'
    });
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  } catch {
    return false;
  }
}

async function ensurePublicContentTarget(motherEmitter, jwt, target, language = 'en') {
  if (!target) return { ok: false, reason: 'missing-target' };

  let entry = null;
  if (target.entryId) {
    entry = await emitOptionalAsync(motherEmitter, BACKEND_EVENTS.GET_CONTENT_ENTRY, {
      jwt,
      moduleName: 'contentEngine',
      moduleType: 'core',
      entryId: target.entryId
    }, null);
  } else if (target.sourceModule && target.sourceId) {
    entry = await emitOptionalAsync(motherEmitter, BACKEND_EVENTS.GET_CONTENT_ENTRY_BY_SOURCE, {
      jwt,
      moduleName: 'contentEngine',
      moduleType: 'core',
      sourceModule: target.sourceModule,
      sourceId: target.sourceId,
      language
    }, null);
  }

  if (entry && !isPublishedEntry(entry)) {
    return { ok: false, reason: 'not-public', entry };
  }
  return { ok: true, entry };
}

async function loadContentEntryForTarget(motherEmitter, jwt, target, language = 'en') {
  if (!target) return null;
  if (target.entryId) {
    return requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_CONTENT_ENTRY, {
      jwt,
      moduleName: 'contentEngine',
      moduleType: 'core',
      entryId: target.entryId
    });
  }
  if (target.sourceModule && target.sourceId) {
    return requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_CONTENT_ENTRY_BY_SOURCE, {
      jwt,
      moduleName: 'contentEngine',
      moduleType: 'core',
      sourceModule: target.sourceModule,
      sourceId: target.sourceId
    });
  }
  if (target.path) {
    return requestBackendEvent(motherEmitter, BACKEND_EVENTS.RESOLVE_CONTENT_PERMALINK, {
      jwt,
      moduleName: 'contentEngine',
      moduleType: 'core',
      permalink: target.path,
      language
    });
  }
  return null;
}

function applyPreviewOverlay(entry = {}, overlay = {}, source = 'entry') {
  if (!overlay || !Object.keys(overlay).length) {
    return { entry, source: 'entry', overlay: null };
  }

  return {
    source,
    overlay,
    entry: {
      ...entry,
      status: overlay.status ?? entry.status,
      title: overlay.title ?? entry.title,
      excerpt: overlay.excerpt ?? entry.excerpt,
      content: overlay.content ?? entry.content,
      meta: {
        ...(entry.meta || {}),
        ...(overlay.meta || {})
      },
      updatedAt: overlay.updatedAt || overlay.updated_at || entry.updatedAt || entry.updated_at,
      updated_at: overlay.updatedAt || overlay.updated_at || entry.updated_at
    }
  };
}

async function loadPreviewOverlay(motherEmitter, jwt, tokenPayload, entry) {
  const entryId = String(entry.id || entry.entryId || tokenPayload.entryId || '');
  if (tokenPayload.revisionId || tokenPayload.version) {
    const revision = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_CONTENT_REVISION, {
      jwt,
      moduleName: 'contentEngine',
      moduleType: 'core',
      entryId,
      revisionId: tokenPayload.revisionId || null,
      version: tokenPayload.version || null
    });
    if (!revision) throw new Error('Preview revision not found.');
    const revisionEntryId = String(revision.entry_id || revision.entryId || entryId);
    if (revisionEntryId !== entryId) throw new Error('Preview revision target mismatch.');
    return applyPreviewOverlay(entry, revision, 'revision');
  }

  if (tokenPayload.autosaveId || tokenPayload.useAutosave) {
    const autosave = await emitOptionalAsync(motherEmitter, BACKEND_EVENTS.GET_CONTENT_AUTOSAVE, {
      jwt,
      moduleName: 'workflowManager',
      moduleType: 'core',
      id: tokenPayload.autosaveId || null,
      entryId,
      authorId: tokenPayload.userId || ''
    }, null);
    if (tokenPayload.autosaveId && !autosave) throw new Error('Preview autosave not found.');
    if (autosave) return applyPreviewOverlay(entry, autosave, 'autosave');
  }

  return { entry, source: 'entry', overlay: null };
}

async function loadPreviewEntry(motherEmitter, jwt, tokenPayload) {
  const target = previewTargetFromPayload(tokenPayload);
  const entry = await loadContentEntryForTarget(motherEmitter, jwt, target, tokenPayload.language || 'en');
  if (!entry || isDeletedEntry(entry)) {
    return null;
  }
  return loadPreviewOverlay(motherEmitter, jwt, tokenPayload, entry);
}

async function resolvePublicContentByPath(motherEmitter, jwt, req, res) {
  const requestedPath = normalizePublicPath(publicPathFromRequest(req));
  const language = languageFromRequest(req, 'en');
  const entry = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.RESOLVE_CONTENT_PERMALINK, {
    jwt,
    moduleName: 'contentEngine',
    moduleType: 'core',
    permalink: requestedPath,
    language
  });

  if (!isPublishedEntry(entry)) {
    return sendPublicNotFound(res, 'content_not_found');
  }

  const seoResult = await emitOptionalAsync(motherEmitter, BACKEND_EVENTS.RESOLVE_SEO_META, {
      jwt,
      moduleName: 'seoManager',
      moduleType: 'core',
      path: entry.permalink || requestedPath,
      language
    }, null);

  res.set('Cache-Control', 'public, max-age=60');
  return res.json({
    entry: toPublicEntry(entry),
    seo: seoResult?.seo || null
  });
}

async function listPublicContent(motherEmitter, jwt, req, res) {
  const contentTypeKey = normalizePublicKey(req.params?.contentTypeKey || req.query?.contentTypeKey || req.query?.type || '');
  const language = languageFromRequest(req, '');
  const limit = parseLimit(req.query?.limit);
  const offset = parseOffset(req.query?.offset);
  const entries = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.LIST_CONTENT_ENTRIES, {
    jwt,
    moduleName: 'contentEngine',
    moduleType: 'core',
    contentTypeKey,
    status: 'published',
    language,
    limit,
    offset
  });

  res.set('Cache-Control', 'public, max-age=60');
  return res.json({
    entries: (Array.isArray(entries) ? entries : []).filter(isPublishedEntry).map(toPublicEntry),
    pagination: {
      limit,
      offset,
      count: Array.isArray(entries) ? entries.length : 0
    }
  });
}

async function renderPublicSearch(motherEmitter, jwt, req, res) {
  try {
    const limit = parseLimit(req.query?.limit, 20);
    const offset = parseOffset(req.query?.offset);
    const results = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.SEARCH_DOCUMENTS, {
      jwt,
      moduleName: 'searchManager',
      moduleType: 'core',
      decodedJWT: PUBLIC_READ_PRINCIPAL,
      query: req.query?.q || req.query?.query || '',
      contentTypeKey: normalizePublicKey(req.query?.contentTypeKey || req.query?.type || ''),
      language: languageFromRequest(req, ''),
      status: 'published',
      visibility: 'public',
      limit,
      offset
    });

    res.set('Cache-Control', 'public, max-age=30');
    return res.json({
      results: (Array.isArray(results) ? results : []).filter(isPublicSearchDocument).map(toPublicSearchDocument),
      pagination: {
        limit,
        offset,
        count: Array.isArray(results) ? results.length : 0
      }
    });
  } catch (err) {
    return sendPublicApiError(res, err);
  }
}

async function createContentPreviewToken(motherEmitter, jwt, payload = {}) {
  assertRuntimePayload(payload, BACKEND_EVENTS.CREATE_CONTENT_PREVIEW_TOKEN);
  requirePayloadPermission(payload, 'content.update');

  const target = previewTargetFromPayload(payload);
  if (!target) throw new Error('Preview target is required.');

  const language = String(payload.language || 'en').trim().toLowerCase();
  const entry = await loadContentEntryForTarget(motherEmitter, jwt, target, language);
  if (!entry || isDeletedEntry(entry)) {
    throw new Error('Content entry not found.');
  }

  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = clampPreviewTtl(payload.ttlSeconds || payload.ttl);
  const entryId = String(entry.id || entry.entryId || target.entryId || '');
  const tokenPayload = stripUndefined({
    v: 1,
    purpose: 'content-preview',
    entryId,
    sourceModule: entry.sourceModule || entry.source_module || target.sourceModule,
    sourceId: entry.sourceId || entry.source_id || target.sourceId,
    path: entry.permalink || target.path,
    language: entry.language || language,
    revisionId: payload.revisionId || payload.revision_id,
    version: payload.version ? Number(payload.version) : undefined,
    autosaveId: payload.autosaveId || payload.autosave_id,
    useAutosave: payload.useAutosave === true,
    userId: actorIdFromPayload(payload),
    iat: now,
    exp: now + ttlSeconds,
    nonce: crypto.randomBytes(8).toString('hex')
  });
  const token = signPreviewPayload(tokenPayload);

  return {
    token,
    previewUrl: `/api/public/preview?token=${encodeURIComponent(token)}`,
    expiresAt: new Date(tokenPayload.exp * 1000).toISOString(),
    entry: toPublicEntry(entry)
  };
}

function requirePublicRuntimePrincipal(payload) {
  if (!payload?.decodedJWT) {
    throw new Error('Authentication required: public runtime principal missing.');
  }
}

const { cmsAdminApiRequest, cmsPublicRuntimeRequest } = createFacadeDispatchers({
  actorIdFromPayload,
  assertRuntimePayload,
  isPublicDesignResult,
  isPublishedPublicPage,
  normalizeRuntimeRows,
  normalizeRuntimeSingle,
  requestEvent: (emitter, eventName, payload) => requestBackendEvent(emitter, eventName, payload),
  requireAdminPrincipal,
  requirePayloadPermission,
  requirePublicRuntimePrincipal,
  toPublicDesignerLayout,
  toPublicDesignResult,
  toPublicPage,
  toPublicPlainSpaceData
});
async function renderPublicPreview(motherEmitter, jwt, req, res) {
  try {
    const rawToken = req.query?.token || String(req.get?.('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!rawToken) {
      return res.status(401).json({ error: { code: 'missing_preview_token', message: 'Preview token is required.' } });
    }

    let tokenPayload = null;
    try {
      tokenPayload = verifyPreviewToken(rawToken);
    } catch {
      return res.status(401).json({ error: { code: 'invalid_preview_token', message: 'Invalid or expired preview token.' } });
    }

    const preview = await loadPreviewEntry(motherEmitter, jwt, tokenPayload);
    if (!preview) return sendPublicNotFound(res, 'preview_not_found');

    const entryId = preview.entry.id || preview.entry.entryId || tokenPayload.entryId;
    const seoResult = await emitOptionalAsync(motherEmitter, BACKEND_EVENTS.RESOLVE_SEO_META, {
        jwt,
        moduleName: 'seoManager',
        moduleType: 'core',
        path: preview.entry.permalink || tokenPayload.path || '',
        entryId,
        language: tokenPayload.language || preview.entry.language || 'en'
      }, null);

    res.set('Cache-Control', 'no-store');
    return res.json({
      entry: toPublicEntry(preview.entry),
      preview: toPreviewInfo(tokenPayload, preview.source),
      seo: seoResult?.seo || null
    });
  } catch (err) {
    return sendPublicApiError(res, err);
  }
}

async function renderPublicContent(motherEmitter, jwt, req, res) {
  try {
    if (publicPathFromRequest(req)) {
      return await resolvePublicContentByPath(motherEmitter, jwt, req, res);
    }
    return await listPublicContent(motherEmitter, jwt, req, res);
  } catch (err) {
    return sendPublicApiError(res, err);
  }
}

async function listPublicComments(motherEmitter, jwt, req, res) {
  const target = publicCommentTargetFromRequest(req);
  const targetCheck = await ensurePublicContentTarget(motherEmitter, jwt, target, languageFromRequest(req, 'en'));
  if (!targetCheck.ok) {
    if (targetCheck.reason === 'missing-target') {
      return res.status(400).json({ error: { code: 'invalid_comment_target', message: 'entryId or sourceModule/sourceId is required.' } });
    }
    return sendPublicNotFound(res, 'comments_not_found');
  }

  const limit = parseLimit(req.query?.limit, 50);
  const offset = parseOffset(req.query?.offset);
  const comments = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.LIST_COMMENTS_FOR_ENTRY, {
    jwt,
    moduleName: 'commentsManager',
    moduleType: 'core',
    decodedJWT: PUBLIC_READ_PRINCIPAL,
    ...target,
    status: 'approved',
    limit,
    offset
  });

  res.set('Cache-Control', 'public, max-age=30');
  return res.json({
    comments: (Array.isArray(comments) ? comments : []).filter(isApprovedComment).map(toPublicComment),
    pagination: {
      limit,
      offset,
      count: Array.isArray(comments) ? comments.length : 0
    }
  });
}

async function createPublicComment(motherEmitter, jwt, req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const target = publicCommentTargetFromRequest(req, body);
  const targetCheck = await ensurePublicContentTarget(motherEmitter, jwt, target, languageFromRequest(req, 'en'));
  if (!targetCheck.ok) {
    if (targetCheck.reason === 'missing-target') {
      return res.status(400).json({ error: { code: 'invalid_comment_target', message: 'entryId or sourceModule/sourceId is required.' } });
    }
    return sendPublicNotFound(res, 'comments_not_found');
  }

  if (!String(body.content || '').trim()) {
    return res.status(400).json({ error: { code: 'invalid_comment_content', message: 'Comment content is required.' } });
  }

  const input = {
    jwt,
    moduleName: 'commentsManager',
    moduleType: 'core',
    decodedJWT: PUBLIC_COMMENT_PRINCIPAL,
    ...target,
    parentId: body.parentId || body.parent_id || null,
    authorName: body.authorName || body.author_name || 'Anonymous',
    authorEmail: body.authorEmail || body.author_email || '',
    authorUrl: body.authorUrl || body.author_url || '',
    authorIp: req.ip || req.connection?.remoteAddress || '',
    userAgent: req.get?.('user-agent') || '',
    content: body.content,
    status: 'pending',
    meta: publicMeta(body.meta || {})
  };
  const result = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.CREATE_COMMENT, input);

  res.set('Cache-Control', 'no-store');
  return res.status(201).json({
    comment: toPublicComment({
      ...input,
      ...result,
      status: result?.status || 'pending'
    }),
    moderation: 'pending'
  });
}

async function renderPublicComments(motherEmitter, jwt, req, res) {
  try {
    if (String(req.method || '').toUpperCase() === 'POST') {
      return await createPublicComment(motherEmitter, jwt, req, res);
    }
    return await listPublicComments(motherEmitter, jwt, req, res);
  } catch (err) {
    return sendPublicApiError(res, err);
  }
}

async function renderPublicNavigation(motherEmitter, jwt, req, res) {
  try {
    const locationKey = normalizePublicKey(req.params?.locationKey || req.query?.location || 'primary');
    if (!locationKey) {
      return res.status(400).json({ error: { code: 'invalid_location', message: 'Navigation location is required.' } });
    }

    const result = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_NAVIGATION_TREE, {
      jwt,
      moduleName: 'navigationManager',
      moduleType: 'core',
      locationKey,
      status: 'active'
    });

    res.set('Cache-Control', 'public, max-age=60');
    return res.json({
      menu: toPublicMenu(result?.menu || {}),
      items: activeNavigationItems(result?.items || []).map(toPublicNavigationItem),
      tree: activeNavigationItems(result?.tree || []).map(toPublicNavigationItem)
    });
  } catch (err) {
    return sendPublicApiError(res, err);
  }
}

function publicSettingKeysFromRequest(req) {
  const raw = req.query?.keys || req.query?.key || '';
  if (Array.isArray(raw)) return raw.flatMap(item => String(item || '').split(',')).map(item => item.trim()).filter(Boolean);
  return String(raw || '').split(',').map(item => item.trim()).filter(Boolean);
}

async function renderPublicSettings(motherEmitter, jwt, req, res) {
  try {
    const keys = publicSettingKeysFromRequest(req);
    const settings = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_PUBLIC_SETTINGS, {
      jwt,
      moduleName: 'settingsManager',
      moduleType: 'core',
      ...(keys.length ? { keys } : {})
    });
    res.set('Cache-Control', 'public, max-age=60');
    return res.json({ settings: settings || {} });
  } catch (err) {
    if (/key not allowed/i.test(err?.message || '')) err.statusCode = 403;
    return sendPublicApiError(res, err);
  }
}

async function renderPublicSeo(motherEmitter, jwt, req, res) {
  try {
    const requestedPath = publicPathFromRequest(req) ? normalizePublicPath(publicPathFromRequest(req)) : '';
    const entryId = req.query?.entryId || req.query?.id || '';
    const language = languageFromRequest(req, 'en');
    let entry = null;

    if (requestedPath) {
      entry = await emitOptionalAsync(motherEmitter, BACKEND_EVENTS.RESOLVE_CONTENT_PERMALINK, {
        jwt,
        moduleName: 'contentEngine',
        moduleType: 'core',
        permalink: requestedPath,
        language
      }, null);
    } else if (entryId) {
      entry = await emitOptionalAsync(motherEmitter, BACKEND_EVENTS.GET_CONTENT_ENTRY, {
        jwt,
        moduleName: 'contentEngine',
        moduleType: 'core',
        entryId
      }, null);
    }

    if ((requestedPath || entryId) && entry && !isPublishedEntry(entry)) {
      return sendPublicNotFound(res, 'seo_not_found');
    }

    const seoPayload = {
      jwt,
      moduleName: 'seoManager',
      moduleType: 'core',
      language
    };
    if (requestedPath) seoPayload.path = requestedPath;
    else if (entryId) seoPayload.entryId = entryId;
    else {
      seoPayload.targetType = 'global';
      seoPayload.targetKey = 'default';
    }

    const result = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.RESOLVE_SEO_META, seoPayload);
    res.set('Cache-Control', 'public, max-age=60');
    return res.json({
      target: result?.target || null,
      seo: result?.seo || {},
      entry: isPublishedEntry(entry) ? toPublicEntry(entry) : null
    });
  } catch (err) {
    return sendPublicApiError(res, err);
  }
}

async function handleRedirectRequest(motherEmitter, jwt, req, res, next) {
  if (!shouldCheckRedirect(req)) return next();
  try {
    if (await isMaintenanceMode(motherEmitter, jwt)) {
      return next();
    }

    const resolved = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.RESOLVE_REDIRECT, {
      jwt,
      moduleName: 'redirectManager',
      moduleType: 'core',
      path: req.path || '/',
      language: req.query?.lang || req.query?.language || '',
      userAgent: req.get?.('user-agent') || '',
      referer: req.get?.('referer') || req.get?.('referrer') || ''
    });

    if (!resolved?.target) return next();
    const currentUrl = req.originalUrl || req.url || req.path || '/';
    if (resolved.target === currentUrl || resolved.target === req.path) return next();

    res.redirect(normalizeRedirectStatus(resolved.statusCode), resolved.target);
  } catch (err) {
    console.warn('[RUNTIME MANAGER] Redirect lookup failed:', err.message);
    next();
  }
}

async function renderSitemap(motherEmitter, jwt, req, res, next) {
  try {
    const xml = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GENERATE_SEO_SITEMAP, {
      jwt,
      moduleName: 'seoManager',
      moduleType: 'core',
      baseUrl: baseUrlFromRequest(req),
      language: req.query?.lang || req.query?.language || '',
      limit: req.query?.limit || 500
    });
    res.set('Cache-Control', 'public, max-age=300');
    res.type('application/xml').send(xml);
  } catch (err) {
    next(err);
  }
}

async function renderRobots(motherEmitter, jwt, req, res, next) {
  try {
    const txt = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GENERATE_ROBOTS_TXT, {
      jwt,
      moduleName: 'seoManager',
      moduleType: 'core',
      baseUrl: baseUrlFromRequest(req)
    });
    res.set('Cache-Control', 'public, max-age=300');
    res.type('text/plain').send(txt);
  } catch (err) {
    next(err);
  }
}

function setupRuntimeEvents(motherEmitter, runtimeJwt = '') {
  registerEventContractHandler(
    motherEmitter,
    BACKEND_EVENT_CONTRACTS.CMS_ADMIN_API_REQUEST,
    payload => cmsAdminApiRequest(motherEmitter, payload.jwt, payload),
    { moduleName: MODULE_NAME }
  );

  registerEventContractHandler(
    motherEmitter,
    BACKEND_EVENT_CONTRACTS.CMS_PUBLIC_RUNTIME_REQUEST,
    payload => cmsPublicRuntimeRequest(motherEmitter, runtimeJwt || payload.jwt, payload),
    { moduleName: MODULE_NAME }
  );

  motherEmitter.on(BACKEND_EVENTS.CREATE_CONTENT_PREVIEW_TOKEN, async (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      const result = await createContentPreviewToken(motherEmitter, payload?.jwt, payload);
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });
}

function registerPublicRuntimeRoutes(app, motherEmitter, jwt) {
  app.get('/api/public/search', (req, res) => renderPublicSearch(motherEmitter, jwt, req, res));
  app.get('/api/public/preview', (req, res) => renderPublicPreview(motherEmitter, jwt, req, res));
  app.get('/api/public/content', (req, res) => renderPublicContent(motherEmitter, jwt, req, res));
  app.get('/api/public/content/:contentTypeKey', (req, res) => renderPublicContent(motherEmitter, jwt, req, res));
  app.get('/api/public/comments', (req, res) => renderPublicComments(motherEmitter, jwt, req, res));
  app.post('/api/public/comments', (req, res) => renderPublicComments(motherEmitter, jwt, req, res));
  app.get('/api/public/navigation/:locationKey', (req, res) => renderPublicNavigation(motherEmitter, jwt, req, res));
  app.get('/api/public/settings', (req, res) => renderPublicSettings(motherEmitter, jwt, req, res));
  app.get('/api/public/seo', (req, res) => renderPublicSeo(motherEmitter, jwt, req, res));
  app.get('/sitemap.xml', (req, res, next) => renderSitemap(motherEmitter, jwt, req, res, next));
  app.get('/robots.txt', (req, res, next) => renderRobots(motherEmitter, jwt, req, res, next));
  app.use((req, res, next) => handleRedirectRequest(motherEmitter, jwt, req, res, next));
}

async function runScheduledPublisherOnce(motherEmitter, jwt, options = {}) {
  if (typeof motherEmitter.listenerCount === 'function' &&
      motherEmitter.listenerCount(BACKEND_EVENTS.PUBLISH_SCHEDULED_CONTENT_ENTRIES) === 0) {
    return { skipped: true, reason: 'missing-listener' };
  }
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.PUBLISH_SCHEDULED_CONTENT_ENTRIES, {
    jwt,
    moduleName: 'contentEngine',
    moduleType: 'core',
    dueBefore: new Date().toISOString(),
    limit: Number(options.limit) || DEFAULT_SCHEDULE_LIMIT
  });
}

function startScheduledPublisher(motherEmitter, jwt, options = {}) {
  if (process.env.CONTENT_SCHEDULER_DISABLED === 'true' || options.disabled === true) {
    return null;
  }

  const intervalMs = Math.max(
    Number(options.intervalMs || process.env.CONTENT_SCHEDULER_INTERVAL_MS || DEFAULT_SCHEDULE_INTERVAL_MS),
    5000
  );

  const tick = async () => {
    try {
      const result = await runScheduledPublisherOnce(motherEmitter, jwt, options);
      if (result?.publishedCount > 0) {
        console.log(`[RUNTIME MANAGER] Published ${result.publishedCount} scheduled entries.`);
      }
    } catch (err) {
      console.warn('[RUNTIME MANAGER] Scheduled publishing failed:', err.message);
    }
  };

  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  tick();
  return timer;
}

module.exports = {
  async initialize({ app, motherEmitter, isCore, jwt }) {
    if (!isCore) throw new Error('[RUNTIME MANAGER] Must be loaded as a core module.');
    if (!jwt) throw new Error('[RUNTIME MANAGER] initialization requires a valid JWT token.');
    if (!app) throw new Error('[RUNTIME MANAGER] Express app is required.');
    if (!motherEmitter) throw new Error('[RUNTIME MANAGER] motherEmitter missing.');
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    console.log('[RUNTIME MANAGER] Initializing public runtime hooks...');
    setupRuntimeEvents(motherEmitter, jwt);
    registerPublicRuntimeRoutes(app, motherEmitter, jwt);
    startScheduledPublisher(motherEmitter, jwt);
    console.log('[RUNTIME MANAGER] Ready.');
  },

  _internals: {
    activeNavigationItems,
    adminApiDefinition,
    adminApiEventDefinition,
    baseUrlFromRequest,
    cmsAdminApiRequest,
    cmsPublicRuntimeRequest,
    createPublicComment,
    createContentPreviewToken,
    handleRedirectRequest,
    isPublicSearchDocument,
    languageFromRequest,
    loadPreviewEntry,
    listPublicComments,
    listPublicContent,
    normalizeRedirectStatus,
    publicRuntimeDefinition,
    normalizePublicKey,
    normalizePublicPath,
    registerPublicRuntimeRoutes,
    renderPublicComments,
    renderPublicContent,
    renderPublicNavigation,
    renderPublicPreview,
    renderPublicSearch,
    renderPublicSeo,
    renderPublicSettings,
    renderRobots,
    renderSitemap,
    setupRuntimeEvents,
    signPreviewPayload,
    isMaintenanceMode,
    runScheduledPublisherOnce,
    shouldCheckRedirect,
    startScheduledPublisher,
    verifyPreviewToken
  },

  MODULE_NAME,
  MODULE_TYPE
};
