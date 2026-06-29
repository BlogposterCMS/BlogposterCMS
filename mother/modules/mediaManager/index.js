/**
 * mother/modules/mediaManager/index.js
 *
 * Provides meltdown events to physically manipulate local folders/files
 * and optionally update DB metadata. Now includes a "makeFilePublic" event
 * that checks user permissions before moving a file into the public folder
 * + calling shareManager.
 */

const fs = require('fs');
const path = require('path');
const {
  ensureMediaManagerDatabase,
  ensureMediaTables,
  mediaDbSelect,
  mediaDbUpdate
} = require('./mediaService');
const csrfProtection = require('../../utils/csrfProtection');
const { requireAuthCookie } = require('../auth/authMiddleware');
const createUpload = require('../../utils/streamUploadMiddleware');

// Because meltdown events might get double-called, we import onceCallback
const { onceCallback } = require('../../emitters/motherEmitter');

const { hasPermission } = require('../userManagement/permissionUtils');

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/svg+xml',
  'image/x-icon',
  'text/html',
  'text/css',
  'application/javascript',
  'font/woff',
  'font/woff2',
  'font/ttf',
  'font/otf',
  'application/vnd.ms-fontobject'
];

const EXTENSION_MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject'
};

const MODULE_NAME = 'mediaManager';
const MODULE_TYPE = 'core';
const VERSION = '0.7.0';
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/g;
const MAX_STRING_LENGTH = 8000;
const MAX_ARRAY_LENGTH = 80;
const MAX_OBJECT_KEYS = 80;
const MAX_JSON_DEPTH = 6;
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const VALID_STATUSES = new Set(['active', 'draft', 'archived', 'deleted']);
const VALID_VISIBILITY = new Set(['public', 'private', 'hidden']);
const VALID_TARGET_TYPES = new Set(['contentEntry', 'source', 'path']);
const LOCAL_FILE_READ_PERMISSIONS = [
  'media.manage',
  'content.update',
  'builder.use',
  'builder.publish'
];
const LOCAL_FILE_WRITE_PERMISSIONS = [
  'media.manage',
  'content.update',
  'builder.publish'
];
const LOCAL_FILE_DELETE_PERMISSIONS = [
  'media.manage',
  'builder.publish'
];

let libraryRoot;

module.exports = {
  /**
   * initialize:
   *  1) Ensures we are a core module
   *  2) Ensures DB or schema if desired
   *  3) Ensures the "library" folder is created
   *  4) Registers meltdown events
   */
  async initialize({ motherEmitter, app, isCore, jwt }) {
    if (!isCore) {
      throw new Error('[MEDIA MANAGER] Must be loaded as a core module.');
    }
    if (!jwt) {
      throw new Error('[MEDIA MANAGER] initialization requires a valid JWT token.');
    }
    if (!motherEmitter) {
      throw new Error('[MEDIA MANAGER] motherEmitter missing.');
    }

    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    console.log('[MEDIA MANAGER] Initializing...');

    // Decide on the library folder path
    libraryRoot = path.join(process.cwd(), 'library');
    ensureLibraryFolder();

    try {
      // If you need DB-based metadata or schema creation:
      await ensureMediaManagerDatabase(motherEmitter, jwt);
      await ensureMediaTables(motherEmitter, jwt);

      // Register meltdown events for local FS actions
      setupMediaManagerEvents(motherEmitter);
      setupMediaMetadataEvents(motherEmitter);

      if (app) {
        setupUploadRoute(app);
      }

      console.log('[MEDIA MANAGER] Ready!');
    } catch (err) {
      console.error('[MEDIA MANAGER] Error =>', err.message);
    }
  },
  setupMediaMetadataEvents,
  _internals: {
    guessFileType,
    normalizeAttachmentKey,
    normalizeLibraryRelativePath,
    normalizeLibraryPath,
    normalizeListLimit,
    normalizeMediaAttachment,
    normalizeMediaTarget,
    normalizeMediaVariant,
    normalizePublicUrl,
    normalizeScalarId,
    resolveLibraryPath
  },
  MODULE_NAME,
  MODULE_TYPE,
  VERSION
};

function assertCorePayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[MEDIA MANAGER] ${eventName} => invalid meltdown payload.`);
  }
}

function requirePermission(payload, permission) {
  if (payload?.decodedJWT && !hasPermission(payload.decodedJWT, permission)) {
    throw new Error(`Forbidden - missing permission: ${permission}`);
  }
}

function requireAnyPermission(payload, permissions = []) {
  if (!payload?.decodedJWT) {
    throw new Error('Authentication required: admin principal missing.');
  }
  if (permissions.some(permission => hasPermission(payload.decodedJWT, permission))) return;
  throw new Error(`Forbidden - missing permission: ${permissions[0]}`);
}

function canManageMedia(payload) {
  return !payload?.decodedJWT || hasPermission(payload.decodedJWT, 'media.manage');
}

function assertInsideRoot(rootPath, candidatePath, label = 'path') {
  const root = path.resolve(rootPath);
  const resolved = path.resolve(candidatePath);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  const compareRoot = process.platform === 'win32' ? root.toLowerCase() : root;
  const compareRootPrefix = process.platform === 'win32' ? rootPrefix.toLowerCase() : rootPrefix;
  const compareResolved = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  if (compareResolved !== compareRoot && !compareResolved.startsWith(compareRootPrefix)) {
    throw new Error(`[MEDIA MANAGER] Invalid library ${label}.`);
  }
  return resolved;
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

function firstScalarId(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    const normalized = normalizeScalarId(value);
    if (normalized || normalized === 0) return normalized;
  }
  return null;
}

function normalizeListLimit(value, fallback = 50, max = 200) {
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
  if (typeof value === 'string') return normalizeText(value, MAX_STRING_LENGTH);
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

function sanitizeMeta(value) {
  return sanitizeJsonish(value && typeof value === 'object' && !Array.isArray(value) ? value : {}, 1) || {};
}

function normalizeLibraryRelativePath(value = '', options = {}) {
  const raw = scalarString(value, '').trim().replace(/\\/g, '/');
  if (raw.includes('\0') || /^[A-Za-z]:/.test(raw) || raw.startsWith('/')) {
    throw new Error('[MEDIA MANAGER] Invalid library path.');
  }
  const parts = raw.split('/').filter(Boolean);
  if (parts.some(part => part === '.' || part === '..')) {
    throw new Error('[MEDIA MANAGER] Invalid library path.');
  }
  if (!options.allowEmpty && parts.length === 0) {
    throw new Error('[MEDIA MANAGER] Invalid library path.');
  }
  return parts.join('/');
}

function normalizeLibrarySegment(value = '', label = 'name') {
  const normalized = normalizeLibraryRelativePath(value, { allowEmpty: false });
  if (normalized.includes('/')) {
    throw new Error(`[MEDIA MANAGER] Invalid library ${label}.`);
  }
  return normalized;
}

function resolveLibraryPath(relativePath = '') {
  const normalized = normalizeLibraryRelativePath(relativePath, { allowEmpty: true });
  return assertInsideRoot(libraryRoot, path.join(libraryRoot, ...normalized.split('/').filter(Boolean)), 'path');
}

function assertLibraryPathSafe(targetPath, label = 'path') {
  const resolved = assertInsideRoot(libraryRoot, targetPath, label);
  const root = path.resolve(libraryRoot);
  const relative = path.relative(root, resolved);
  const parts = relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    ? relative.split(path.sep).filter(Boolean)
    : [];
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) break;
    const stats = fs.lstatSync(current);
    if (stats.isSymbolicLink()) {
      throw new Error(`[MEDIA MANAGER] Library ${label} cannot be a symlink or junction.`);
    }
  }
  const realRoot = fs.realpathSync(libraryRoot);
  const existingForRealPath = fs.existsSync(resolved)
    ? resolved
    : path.dirname(resolved);
  if (fs.existsSync(existingForRealPath)) {
    const realTarget = fs.realpathSync(existingForRealPath);
    assertInsideRoot(realRoot, realTarget, label);
  }
  return resolved;
}

function normalizeText(value = '', max = 1000) {
  return scalarString(value, '').trim().slice(0, max);
}

function normalizeKey(value = '', max = 120) {
  return normalizeText(value, max).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

function normalizeLibraryPath(value = '') {
  const raw = normalizeText(value, 1000).replace(/\\/g, '/');
  return raw.replace(/^([./\\]+)+/, '').replace(/\/{2,}/g, '/');
}

function normalizePublicUrl(value = '') {
  const url = normalizeText(value, 1200);
  const lower = url.toLowerCase();
  if (/^(javascript|data|vbscript):/.test(lower) || url.startsWith('//')) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^https?:\/\//i.test(url)) return '';
  return url;
}

function normalizeStatus(value = 'active') {
  const status = normalizeKey(value || 'active', 40);
  return VALID_STATUSES.has(status) ? status : 'active';
}

function normalizeVisibility(value = 'public') {
  const visibility = normalizeKey(value || 'public', 40);
  return VALID_VISIBILITY.has(visibility) ? visibility : 'public';
}

function guessFileName(payload = {}) {
  const direct = payload.fileName || payload.file_name || payload.name;
  if (direct) return path.basename(String(direct));
  const storagePath = payload.storagePath || payload.storage_path || payload.location || '';
  if (storagePath) return path.basename(String(storagePath).replace(/\\/g, '/'));
  const url = payload.url || payload.publicUrl || '';
  if (url) {
    try {
      return path.basename(new URL(url, 'https://example.test').pathname);
    } catch {
      return path.basename(String(url).split('?')[0]);
    }
  }
  return '';
}

function guessFileType(fileName = '', mimeType = '') {
  if (mimeType) return mimeType.split('/')[0] || '';
  const ext = path.extname(fileName).replace(/^\./, '').toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg'].includes(ext)) return 'audio';
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx'].includes(ext)) return 'document';
  return ext || '';
}

function normalizeMediaAttachment(payload = {}, options = {}) {
  const partial = options.partial === true;
  const hasAny = (...keys) => keys.some(key => Object.prototype.hasOwnProperty.call(payload, key));
  const fileName = guessFileName(payload);
  const mimeType = normalizeText(payload.mimeType || payload.mime_type || '', 160);
  const storagePath = normalizeLibraryPath(payload.storagePath || payload.storage_path || payload.location || '');
  const url = normalizePublicUrl(payload.url || payload.publicUrl || payload.public_url || '');

  if (!partial && !fileName && !storagePath && !url) {
    throw new Error('Media attachment needs fileName, storagePath or url.');
  }

  const normalized = {
    id: firstScalarId(payload.id, payload.attachmentId, payload.attachment_id),
    fileName: fileName || undefined,
    fileType: payload.fileType || payload.file_type
      ? normalizeKey(payload.fileType || payload.file_type, 80)
      : guessFileType(fileName, mimeType),
    mimeType,
    url,
    storagePath,
    folder: normalizeLibraryPath(payload.folder || ''),
    title: normalizeText(payload.title || fileName, 240),
    altText: normalizeText(payload.altText || payload.alt_text || '', 500),
    caption: normalizeText(payload.caption || '', 1000),
    description: normalizeText(payload.description || payload.notes || '', 4000),
    credit: normalizeText(payload.credit || payload.authorCredit || '', 240),
    category: normalizeKey(payload.category || '', 100),
    status: normalizeStatus(payload.status || 'active'),
    visibility: normalizeVisibility(payload.visibility || 'public'),
    userId: firstScalarId(payload.userId, payload.user_id, payload.authorId, payload.author_id),
    sizeBytes: Number(payload.sizeBytes || payload.size_bytes || payload.size || 0) || 0,
    width: Number(payload.width || 0) || 0,
    height: Number(payload.height || 0) || 0,
    checksum: normalizeText(payload.checksum || payload.hash || '', 160),
    sourceModule: normalizeText(payload.sourceModule || payload.source_module || '', 120),
    sourceId: normalizeText(payload.sourceId || payload.source_id || '', 160),
    meta: sanitizeMeta(payload.meta)
  };

  if (!partial) return normalized;

  const explicit = {
    id: hasAny('id', 'attachmentId', 'attachment_id'),
    fileName: hasAny('fileName', 'file_name', 'name'),
    fileType: hasAny('fileType', 'file_type'),
    mimeType: hasAny('mimeType', 'mime_type'),
    url: hasAny('url', 'publicUrl', 'public_url'),
    storagePath: hasAny('storagePath', 'storage_path', 'location'),
    folder: hasAny('folder'),
    title: hasAny('title'),
    altText: hasAny('altText', 'alt_text'),
    caption: hasAny('caption'),
    description: hasAny('description', 'notes'),
    credit: hasAny('credit', 'authorCredit'),
    category: hasAny('category'),
    status: hasAny('status'),
    visibility: hasAny('visibility'),
    userId: hasAny('userId', 'user_id', 'authorId', 'author_id'),
    sizeBytes: hasAny('sizeBytes', 'size_bytes', 'size'),
    width: hasAny('width'),
    height: hasAny('height'),
    checksum: hasAny('checksum', 'hash'),
    sourceModule: hasAny('sourceModule', 'source_module'),
    sourceId: hasAny('sourceId', 'source_id'),
    meta: hasAny('meta')
  };
  for (const [key, isExplicit] of Object.entries(explicit)) {
    if (!isExplicit) delete normalized[key];
  }
  return normalized;
}

function normalizeAttachmentKey(payload = {}) {
  const id = firstScalarId(payload.id, payload.attachmentId, payload.attachment_id);
  if (id || id === 0) {
    return { id };
  }
  const sourceModule = normalizeText(payload.sourceModule || payload.source_module || '', 120);
  const sourceId = normalizeText(payload.sourceId || payload.source_id || '', 160);
  if (sourceModule && sourceId) return { sourceModule, sourceId };
  throw new Error('Media attachment id or sourceModule/sourceId is required.');
}

function normalizeMediaVariant(payload = {}) {
  const attachmentId = firstScalarId(payload.attachmentId, payload.attachment_id, payload.id);
  const variantKey = normalizeKey(payload.variantKey || payload.variant_key || payload.key || '', 80);
  if (!attachmentId || !variantKey) {
    throw new Error('Media variant needs attachmentId and variantKey.');
  }
  return {
    attachmentId,
    variantKey,
    url: normalizePublicUrl(payload.url || ''),
    storagePath: normalizeLibraryPath(payload.storagePath || payload.storage_path || ''),
    mimeType: normalizeText(payload.mimeType || payload.mime_type || '', 160),
    width: Number(payload.width || 0) || 0,
    height: Number(payload.height || 0) || 0,
    sizeBytes: Number(payload.sizeBytes || payload.size_bytes || payload.size || 0) || 0,
    meta: sanitizeMeta(payload.meta)
  };
}

function normalizeMediaTarget(payload = {}) {
  const attachmentId = firstScalarId(payload.attachmentId, payload.attachment_id, payload.mediaId, payload.media_id);
  if (!attachmentId) throw new Error('attachmentId is required.');

  const entryId = firstScalarId(payload.entryId, payload.contentEntryId, payload.entry_id);
  if (entryId || entryId === 0) {
    return {
      attachmentId,
      targetType: 'contentEntry',
      targetId: String(entryId),
      sourceModule: 'contentEngine',
      sourceId: String(entryId),
      role: normalizeKey(payload.role || 'inline', 80) || 'inline',
      sortOrder: Number(payload.sortOrder || payload.sort_order || 0) || 0,
      meta: sanitizeMeta(payload.meta)
    };
  }

  const targetType = normalizeText(payload.targetType || payload.target_type || 'source', 40);
  const safeTargetType = VALID_TARGET_TYPES.has(targetType) ? targetType : 'source';
  const sourceModule = normalizeText(payload.sourceModule || payload.source_module || '', 120);
  const sourceId = normalizeText(payload.sourceId || payload.source_id || '', 160);
  const targetId = normalizeText(payload.targetId || payload.target_id || (sourceModule && sourceId ? `${sourceModule}:${sourceId}` : ''), 240);
  if (!targetId) throw new Error('Media relation target is required.');

  return {
    attachmentId,
    targetType: safeTargetType,
    targetId,
    sourceModule,
    sourceId,
    role: normalizeKey(payload.role || 'inline', 80) || 'inline',
    sortOrder: Number(payload.sortOrder || payload.sort_order || 0) || 0,
    meta: sanitizeMeta(payload.meta)
  };
}

function normalizeContentTarget(payload = {}) {
  const entryId = firstScalarId(payload.entryId, payload.contentEntryId, payload.entry_id);
  if (entryId || entryId === 0) {
    return {
      targetType: 'contentEntry',
      targetId: String(entryId)
    };
  }
  const targetType = normalizeText(payload.targetType || payload.target_type || 'source', 40);
  const safeTargetType = VALID_TARGET_TYPES.has(targetType) ? targetType : 'source';
  const sourceModule = normalizeText(payload.sourceModule || payload.source_module || '', 120);
  const sourceId = normalizeText(payload.sourceId || payload.source_id || '', 160);
  const targetId = normalizeText(payload.targetId || payload.target_id || (sourceModule && sourceId ? `${sourceModule}:${sourceId}` : ''), 240);
  if (!targetId) throw new Error('Media relation target is required.');
  return { targetType: safeTargetType, targetId };
}

function setupMediaMetadataEvents(motherEmitter) {
  motherEmitter.on('createMediaAttachment', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'createMediaAttachment');
      requirePermission(payload, 'media.manage');
      const result = await mediaDbUpdate(motherEmitter, payload.jwt, 'UPSERT_MEDIA_ATTACHMENT', normalizeMediaAttachment(payload));
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('updateMediaAttachment', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'updateMediaAttachment');
      requirePermission(payload, 'media.manage');
      const key = normalizeAttachmentKey(payload);
      const result = await mediaDbUpdate(motherEmitter, payload.jwt, 'UPSERT_MEDIA_ATTACHMENT', {
        ...normalizeMediaAttachment(payload, { partial: true }),
        ...key
      });
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getMediaAttachment', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'getMediaAttachment');
      const result = await mediaDbSelect(motherEmitter, payload.jwt, 'GET_MEDIA_ATTACHMENT', normalizeAttachmentKey(payload));
      const record = Array.isArray(result) ? result[0] || null : result || null;
      if (!canManageMedia(payload) && record && (record.status !== 'active' || record.visibility !== 'public')) {
        callback(null, null);
        return;
      }
      callback(null, record);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('listMediaAttachments', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'listMediaAttachments');
      const manager = canManageMedia(payload);
      const result = await mediaDbSelect(motherEmitter, payload.jwt, 'LIST_MEDIA_ATTACHMENTS', {
        category: normalizeKey(payload.category || '', 100),
        fileType: normalizeKey(payload.fileType || payload.file_type || '', 80),
        mimeType: normalizeText(payload.mimeType || payload.mime_type || '', 160),
        status: manager && payload.status ? normalizeStatus(payload.status) : 'active',
        visibility: manager && payload.visibility ? normalizeVisibility(payload.visibility) : 'public',
        folder: payload.folder ? normalizeLibraryPath(payload.folder) : '',
        query: normalizeText(payload.query || payload.q || '', 200),
        limit: normalizeListLimit(payload.limit, 50, 200),
        offset: normalizeListOffset(payload.offset)
      });
      callback(null, result || []);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('deleteMediaAttachment', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'deleteMediaAttachment');
      requirePermission(payload, 'media.manage');
      const key = normalizeAttachmentKey(payload);
      const record = key.id ? key : await mediaDbSelect(motherEmitter, payload.jwt, 'GET_MEDIA_ATTACHMENT', key);
      const id = key.id || record?.id;
      if (!id) throw new Error('Media attachment not found.');
      const result = await mediaDbUpdate(motherEmitter, payload.jwt, 'DELETE_MEDIA_ATTACHMENT', { id });
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('upsertMediaVariant', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'upsertMediaVariant');
      requirePermission(payload, 'media.manage');
      const result = await mediaDbUpdate(motherEmitter, payload.jwt, 'UPSERT_MEDIA_VARIANT', normalizeMediaVariant(payload));
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('listMediaVariants', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'listMediaVariants');
      const attachmentId = firstScalarId(payload.attachmentId, payload.attachment_id, payload.id);
      if (!attachmentId) throw new Error('attachmentId is required.');
      const result = await mediaDbSelect(motherEmitter, payload.jwt, 'LIST_MEDIA_VARIANTS', { attachmentId });
      callback(null, result || []);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('deleteMediaVariant', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'deleteMediaVariant');
      requirePermission(payload, 'media.manage');
      const result = await mediaDbUpdate(motherEmitter, payload.jwt, 'DELETE_MEDIA_VARIANT', normalizeMediaVariant(payload));
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('linkMediaToContent', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'linkMediaToContent');
      requirePermission(payload, 'media.manage');
      const result = await mediaDbUpdate(motherEmitter, payload.jwt, 'LINK_MEDIA_ATTACHMENT', normalizeMediaTarget(payload));
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('unlinkMediaFromContent', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'unlinkMediaFromContent');
      requirePermission(payload, 'media.manage');
      const result = await mediaDbUpdate(motherEmitter, payload.jwt, 'UNLINK_MEDIA_ATTACHMENT', normalizeMediaTarget(payload));
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('listMediaForContent', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'listMediaForContent');
      const result = await mediaDbSelect(motherEmitter, payload.jwt, 'LIST_MEDIA_FOR_CONTENT', normalizeContentTarget(payload));
      const rows = Array.isArray(result) ? result : [];
      callback(null, canManageMedia(payload) ? rows : rows.filter(row => row.status === 'active' && row.visibility === 'public'));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('listContentForMedia', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'listContentForMedia');
      requirePermission(payload, 'media.manage');
      const attachmentId = firstScalarId(payload.attachmentId, payload.attachment_id, payload.id);
      if (!attachmentId) throw new Error('attachmentId is required.');
      const result = await mediaDbSelect(motherEmitter, payload.jwt, 'LIST_CONTENT_FOR_MEDIA', { attachmentId });
      callback(null, result || []);
    } catch (err) {
      callback(err);
    }
  });
}

/**
 * ensureLibraryFolder:
 *  Creates the library folder if it doesn't exist yet.
 */
function ensureLibraryFolder() {
  const publicDir = path.join(libraryRoot, 'public');
  try {
    fs.mkdirSync(publicDir, { recursive: true });
    console.log('[MEDIA MANAGER] Library folders ensured =>', libraryRoot);
  } catch (err) {
    console.error('[MEDIA MANAGER] Failed to create library folders:', err.message);
  }
}

/**
 * setupMediaManagerEvents:
 *  meltdown events for listing folders, uploading files, etc.
 */
function setupMediaManagerEvents(motherEmitter) {
  console.log('[MEDIA MANAGER] Setting up meltdown events for local FS actions...');

  // meltdown => listLocalFolder
  motherEmitter.on('listLocalFolder', (payload, originalCb) => {
    const callback = onceCallback(originalCb); // we love single-callback sanity

    try {
      assertCorePayload(payload, 'listLocalFolder');
      requireAnyPermission(payload, LOCAL_FILE_READ_PERMISSIONS);
      const { subPath } = payload || {};

      const normalizedSubPath = normalizeLibraryRelativePath(subPath || '', { allowEmpty: true });
      const targetPath = assertLibraryPathSafe(resolveLibraryPath(normalizedSubPath), 'path');
      if (!fs.existsSync(targetPath) || !fs.lstatSync(targetPath).isDirectory()) {
        return callback(new Error(`Not a valid directory => ${targetPath}`));
      }

      const entries = fs.readdirSync(targetPath, { withFileTypes: true });
      const folders = [];
      const files   = [];
      for (const ent of entries) {
        if (ent.isDirectory()) {
          folders.push(ent.name);
        } else {
          files.push(ent.name);
        }
      }

      let parentPath = '';
      if (normalizedSubPath) {
        const parts = normalizedSubPath.split('/').filter(Boolean);
        parts.pop();
        parentPath = parts.join('/');
      }

      callback(null, {
        currentPath: normalizedSubPath,
        parentPath,
        folders,
        files
      });
    } catch (err) {
      callback(err);
    }
  });

  // meltdown => createLocalFolder
  motherEmitter.on('createLocalFolder', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'createLocalFolder');
      requireAnyPermission(payload, LOCAL_FILE_WRITE_PERMISSIONS);
      const { currentPath = '', newFolderName } = payload || {};
      if (!newFolderName) {
        return callback(new Error('[MEDIA MANAGER] createLocalFolder => missing parameters.'));
      }

      const normalizedCurrentPath = normalizeLibraryRelativePath(currentPath, { allowEmpty: true });
      const safeFolderName = normalizeLibrarySegment(newFolderName, 'folder name');
      const parentDir = assertLibraryPathSafe(resolveLibraryPath(normalizedCurrentPath), 'path');
      const targetDir = assertInsideRoot(libraryRoot, path.join(parentDir, safeFolderName), 'path');

      fs.mkdirSync(targetDir, { recursive: true });
      callback(null);
    } catch (err) {
      callback(err);
    }
  });

  // meltdown => renameLocalItem
  motherEmitter.on('renameLocalItem', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'renameLocalItem');
      requireAnyPermission(payload, LOCAL_FILE_DELETE_PERMISSIONS);
      const { currentPath = '', oldName, newName } = payload || {};
      if (!oldName || !newName) {
        return callback(new Error('[MEDIA MANAGER] renameLocalItem => missing parameters.'));
      }

      const normalizedCurrentPath = normalizeLibraryRelativePath(currentPath, { allowEmpty: true });
      const parentDir = assertLibraryPathSafe(resolveLibraryPath(normalizedCurrentPath), 'path');
      const oldPath = assertLibraryPathSafe(path.join(parentDir, normalizeLibrarySegment(oldName, 'item name')), 'path');
      const newPath = assertInsideRoot(libraryRoot, path.join(parentDir, normalizeLibrarySegment(newName, 'item name')), 'path');

      fs.renameSync(oldPath, newPath);
      callback(null);
    } catch (err) {
      callback(err);
    }
  });

  // meltdown => deleteLocalItem
  motherEmitter.on('deleteLocalItem', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'deleteLocalItem');
      requireAnyPermission(payload, LOCAL_FILE_DELETE_PERMISSIONS);
      const { currentPath = '', itemName } = payload || {};
      if (!itemName) {
        return callback(new Error('[MEDIA MANAGER] deleteLocalItem => missing parameters.'));
      }

      const normalizedCurrentPath = normalizeLibraryRelativePath(currentPath, { allowEmpty: true });
      const parentDir = assertLibraryPathSafe(resolveLibraryPath(normalizedCurrentPath), 'path');
      const target = assertLibraryPathSafe(path.join(parentDir, normalizeLibrarySegment(itemName, 'item name')), 'path');

      fs.rmSync(target, { recursive: true, force: true });
      callback(null);
    } catch (err) {
      callback(err);
    }
  });

  // meltdown => uploadFileToFolder
  motherEmitter.on('uploadFileToFolder', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'uploadFileToFolder');
      requireAnyPermission(payload, LOCAL_FILE_WRITE_PERMISSIONS);
      const {
        fileName,
        fileData,
        subPath = ''
      } = payload || {};
      if (!fileName || fileData === undefined || fileData === null) {
        return callback(new Error('[MEDIA MANAGER] uploadFileToFolder => missing parameters.'));
      }

      if (!Buffer.isBuffer(fileData) && typeof fileData !== 'string') {
        return callback(new Error('[MEDIA MANAGER] uploadFileToFolder => invalid file data type.'));
      }

      const targetDir = assertLibraryPathSafe(resolveLibraryPath(subPath), 'path');
      fs.mkdirSync(targetDir, { recursive: true });

      let finalName = path.basename(scalarString(fileName, '').replace(/\\/g, '/'));
      if (!finalName) {
        return callback(new Error('[MEDIA MANAGER] uploadFileToFolder => missing parameters.'));
      }
      const ext = path.extname(finalName).toLowerCase();
      const resolvedMime = EXTENSION_MIME_MAP[ext];
      if (!resolvedMime) {
        return callback(new Error('[MEDIA MANAGER] uploadFileToFolder => disallowed file type.'));
      }

      const initialPath = assertInsideRoot(libraryRoot, path.join(targetDir, finalName), 'path');
      if (fs.existsSync(initialPath)) {
        const timestamp = Date.now();
        const base = path.basename(finalName, ext);
        finalName = `${base}-${timestamp}${ext}`;
      }

      const buffer = Buffer.isBuffer(fileData)
        ? fileData
        : Buffer.from(fileData, 'base64');
      const finalPath = assertInsideRoot(libraryRoot, path.join(targetDir, finalName), 'path');
      fs.writeFileSync(finalPath, buffer);
      callback(null, { success: true, fileName: finalName, mimeType: resolvedMime });
    } catch (err) {
      callback(err);
    }
  });

  /*
   * meltdown => makeFilePublic
   * checks - user roles and permissions
   * physically moves the file to /public
   * meltdown => shareManager => createShareLink
   */
  motherEmitter.on('makeFilePublic', (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    console.log('[MEDIA MANAGER] "makeFilePublic" event =>', {
      filePath: payload?.filePath,
      userId: payload?.userId || payload?.decodedJWT?.userId || payload?.decodedJWT?.sub || null
    });
    const { jwt, moduleName, moduleType, userId, filePath } = payload || {};

    // 1) Basic meltdown checks
    if (!jwt || moduleName !== 'mediaManager' || moduleType !== 'core') {
      return callback(new Error('[MEDIA MANAGER] makeFilePublic => invalid meltdown payload.'));
    }

    const { decodedJWT } = payload;
    const resolvedUserId = userId
      || decodedJWT?.user?.id
      || decodedJWT?.userId
      || decodedJWT?.id
      || decodedJWT?.sub;

    if (!resolvedUserId || !filePath) {
      return callback(new Error('Missing userId or filePath in makeFilePublic.'));
    }

    // 2) Permission check (admins or users with builder.publish)
    const canManageMediaLibrary = decodedJWT && hasPermission(decodedJWT, 'media.manage');
    const canPublishBuilderAssets = decodedJWT && hasPermission(decodedJWT, 'builder.publish');
    if (!canManageMediaLibrary && !canPublishBuilderAssets) {
      return callback(new Error('[MEDIA MANAGER] Permission denied => builder.publish'));
    }

    // 3) Restrict non-admins to builder paths
    const posixPath = normalizeLibraryRelativePath(filePath, { allowEmpty: false });
    if (!canManageMediaLibrary && posixPath !== 'builder' && !posixPath.startsWith('builder/')) {
      return callback(new Error('[MEDIA MANAGER] makeFilePublic => path must reside under "builder/"'));
    }

    // proceed
    actuallyMoveFileToPublic(motherEmitter, { jwt, userId: resolvedUserId, filePath: posixPath }, callback);
  });
}

function setupUploadRoute(app) {
  app.post('/admin/api/upload', requireAuthCookie, csrfProtection, createUpload({
    fieldName: 'file',
    destResolver: (req, _filename) => {
      const sub = decodeURIComponent(req.query.subPath || '');
      return assertLibraryPathSafe(resolveLibraryPath(sub), 'path');
    },
    maxFileSize: parseInt(process.env.MAX_UPLOAD_BYTES || '20000000', 10),
    allowedMimeTypes: ALLOWED_MIME_TYPES
  }), (req, res) => {
    res.json({ success: true, fileName: req.uploadFile.finalName, mimeType: req.uploadFile.mimeType });
  });
}

/**
 * actuallyMoveFileToPublic:
 *  1) physically moves or symlinks from "users/<id>/..." to "library/public/<filename>"
 *  2) meltdown => shareManager => createShareLink
 */
function actuallyMoveFileToPublic(motherEmitter, { jwt, userId, filePath }, callback) {
  try {
    const normalized = normalizeLibraryRelativePath(filePath, { allowEmpty: false });
    const sourceAbs = assertLibraryPathSafe(resolveLibraryPath(normalized), 'path');
    const publicRoot = path.join(libraryRoot, 'public');
    const safePublicRoot = assertLibraryPathSafe(publicRoot, 'public path');
    if (!fs.existsSync(sourceAbs)) {
      return callback(new Error(`Source file not found or outside library => ${filePath}`));
    }

    const publicAbs = assertInsideRoot(
      safePublicRoot,
      path.join(safePublicRoot, ...normalized.split('/').filter(Boolean)),
      'public path'
    );
    assertLibraryPathSafe(path.dirname(publicAbs), 'public path');
    if (fs.existsSync(publicAbs)) assertLibraryPathSafe(publicAbs, 'public path');

    fs.mkdirSync(path.dirname(publicAbs), { recursive: true });
    if (fs.existsSync(publicAbs)) {
      fs.rmSync(publicAbs, { recursive: true, force: true });
    }
    fs.renameSync(sourceAbs, publicAbs);
    console.log(`[MEDIA MANAGER] Moved file from "${sourceAbs}" to "${publicAbs}"`);

    const relativePublicPath = path.relative(libraryRoot, publicAbs);
    motherEmitter.emit('createShareLink', {
      jwt,
      moduleName: 'shareManager',
      moduleType: 'core',
      filePath: relativePublicPath,
      userId,
      isPublic: true
    }, (err, shareData) => {
      if (err) {
        console.warn('[MEDIA MANAGER] Could not create share link =>', err.message);
        return callback(null, { success: true, publicPath: publicAbs, shareLink: null });
      }
      return callback(null, {
        success: true,
        publicPath: publicAbs,
        shareLink: shareData.shareURL
      });
    });
  } catch (ex) {
    callback(ex);
  }
}
