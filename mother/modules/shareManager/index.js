/**
 * mother/modules/shareManager/index.js
 *
 * 1) Ensures DB creation (via meltdown => createDatabase)
 * 2) Ensures schema & table/collection (via meltdown => dbUpdate => 'INIT_SHARED_LINKS_TABLE')
 * 3) Sets up meltdown listeners for createShareLink, revokeShareLink, getShareDetails, etc.
 *
 * We follow a similar pattern to your pagesManager/index.js.
 */

require('dotenv').config();
const { ensureShareManagerDatabase, ensureShareTables } = require('./shareService');

// Because meltdown can be sneaky
const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');

const MODULE_NAME = 'shareManager';
const MODULE_TYPE = 'core';
const TIMEOUT_DURATION = 5000;
const SHORT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{4,128}$/;

function assertSharePayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[SHARE MANAGER] ${eventName} requires shareManager core scope.`);
  }
}

function actorIdFromPayload(payload = {}) {
  return payload.userId
    || payload.decodedJWT?.user?.id
    || payload.decodedJWT?.userId
    || payload.decodedJWT?.id
    || payload.decodedJWT?.sub
    || null;
}

function requirePermission(payload, permission) {
  if (payload?.decodedJWT && !hasPermission(payload.decodedJWT, permission)) {
    throw new Error(`Forbidden - missing permission: ${permission}`);
  }
}

function normalizeSharePath(rawPath) {
  if (typeof rawPath !== 'string') {
    throw new Error('[SHARE MANAGER] Invalid share filePath.');
  }
  const trimmed = rawPath.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.startsWith('//')) {
    throw new Error('[SHARE MANAGER] Invalid share filePath.');
  }

  const segments = trimmed
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split(/[?#]/)[0]
    .split('/')
    .filter(Boolean);

  if (!segments.length) {
    throw new Error('[SHARE MANAGER] Invalid share filePath.');
  }

  return segments.map(segment => {
    const value = segment.trim();
    if (!value || value === '.' || value === '..' || value.includes(':') || /[\0-\x1f\x7f]/.test(value)) {
      throw new Error('[SHARE MANAGER] Invalid share filePath.');
    }
    return value;
  }).join('/');
}

function normalizeShortToken(rawToken) {
  const value = String(rawToken || '').trim();
  if (!SHORT_TOKEN_PATTERN.test(value)) {
    throw new Error('[SHARE MANAGER] Invalid shortToken.');
  }
  return value;
}

function normalizeExpiresAt(rawValue) {
  if (!rawValue) return null;
  const date = new Date(rawValue);
  if (Number.isNaN(date.getTime())) {
    throw new Error('[SHARE MANAGER] Invalid expiresAt.');
  }
  return date.toISOString();
}

module.exports = {
  async initialize({ motherEmitter, isCore, jwt, nonce }) {
    if (!isCore) {
      throw new Error('[SHARE MANAGER] Must be loaded as a core module.');
    }
    if (!jwt) {
      throw new Error('[SHARE MANAGER] initialization requires a valid JWT token.');
    }
    if (!motherEmitter) {
      throw new Error('[SHARE MANAGER] motherEmitter missing.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    console.log('[SHARE MANAGER] Initializing ShareManager Module...');

    try {
      // 1) Ensure shareManager DB or schema
      await ensureShareManagerDatabase(motherEmitter, jwt, nonce);

      // 2) Ensure schema & table/collection
      await ensureShareTables(motherEmitter, jwt, nonce);

      // 3) Register meltdown events for sharing logic
      setupShareEventListeners(motherEmitter);

      console.log('[SHARE MANAGER] ShareManager Module initialized successfully.');
    } catch (err) {
      console.error('[SHARE MANAGER] Error initializing shareManager =>', err.message);
    }
  }
};

/**
 * setupShareEventListeners:
 *   Registers meltdown events:
 *     - createShareLink
 *     - revokeShareLink
 *     - getShareDetails
 *     - etc. (like getAllLinks, if you want)
 *
 * We avoid raw SQL in code. We use placeholders in dbInsert/dbSelect/dbUpdate/dbDelete
 * (e.g. "CREATE_SHARE_LINK", "REVOKE_SHARE_LINK", etc.) so the bridging can handle
 * Postgres or Mongo under the hood.
 */
function setupShareEventListeners(motherEmitter) {
  console.log('[SHARE MANAGER] Setting up meltdown event listeners for share links...');

  // CREATE SHARE LINK
  motherEmitter.on('createShareLink', (payload, originalCb) => {
    // Wrapping meltdown callback
    const callback = onceCallback(originalCb);

    try {
      let {
        jwt,
        filePath,
        userId,         // who is creating
        isPublic = true, // optional flag
        expiresAt       // optional timestamp
      } = payload || {};

      assertSharePayload(payload, 'createShareLink');
      const safeFilePath = normalizeSharePath(filePath);
      userId = userId || actorIdFromPayload(payload);
      if (!userId) {
        return callback(new Error('Missing userId.'));
      }

      requirePermission(payload, 'share.create');

      // We'll create a short token ourselves, or rely on bridging code
      const shortToken = generateRandomToken(8);

      // Data object
      const dataObj = {
        shortToken,
        filePath: safeFilePath,
        userId,
        isPublic: isPublic !== false,
        expiresAt: normalizeExpiresAt(expiresAt)
      };

      const to = setTimeout(() => {
        callback(new Error('Timeout while creating share link.'));
      }, TIMEOUT_DURATION);

      // meltdown => dbInsert => table='__rawSQL__', data.rawSQL='CREATE_SHARE_LINK'
      motherEmitter.emit(
        'dbInsert',
        {
          jwt,
          moduleName: 'shareManager',
          moduleType: 'core',
          table: '__rawSQL__',
          data: {
            rawSQL: 'CREATE_SHARE_LINK',
            ...dataObj
          }
        },
        (err, result) => {
          clearTimeout(to);
          if (err) return callback(err);

          // Suppose bridging returns something, or we just build a final URL
          const baseDomain = process.env.APP_BASE_URL || 'https://example.com';
          const fileName = extractFileName(safeFilePath);
          const shareURL = `${baseDomain}/s/${shortToken}/${fileName}`;

          callback(null, { shortToken, shareURL, expiresAt: dataObj.expiresAt, result });
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // REVOKE SHARE LINK
  motherEmitter.on('revokeShareLink', (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    try {
      let {
        jwt,
        shortToken,
        userId // who is revoking
      } = payload || {};

      assertSharePayload(payload, 'revokeShareLink');
      shortToken = normalizeShortToken(shortToken);
      userId = userId || actorIdFromPayload(payload);
      if (!userId) {
        return callback(new Error('Missing userId.'));
      }

      requirePermission(payload, 'share.revoke');

      const to = setTimeout(() => {
        callback(new Error('Timeout while revoking share link.'));
      }, TIMEOUT_DURATION);

      // meltdown => dbUpdate or dbDelete with placeholder
      motherEmitter.emit(
        'dbUpdate',
        {
          jwt,
          moduleName: 'shareManager',
          moduleType: 'core',
          table: '__rawSQL__',
          data: {
            rawSQL: 'REVOKE_SHARE_LINK',
            shortToken,
            userId
          }
        },
        (err, result) => {
          clearTimeout(to);
          if (err) return callback(err);
          callback(null, { success: true, shortToken, result });
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // GET SHARE DETAILS
  motherEmitter.on('getShareDetails', (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    try {
      const { jwt } = payload || {};
      assertSharePayload(payload, 'getShareDetails');
      const shortToken = normalizeShortToken(payload?.shortToken);

      requirePermission(payload, 'share.read');

      const to = setTimeout(() => {
        callback(new Error('Timeout while getting share details.'));
      }, TIMEOUT_DURATION);

      // meltdown => dbSelect => table='__rawSQL__', data.rawSQL='GET_SHARE_LINK'
      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName: 'shareManager',
          moduleType: 'core',
          table: '__rawSQL__',
          data: {
            rawSQL: 'GET_SHARE_LINK',
            shortToken
          }
        },
        (err, rows) => {
          clearTimeout(to);
          if (err) return callback(err);
          if (!rows || rows.length === 0) {
            return callback(null, null);
          }
          const row = rows[0];
          if (row.expiresAt && Date.now() > new Date(row.expiresAt).getTime()) {
            return callback(null, null);
          }
          callback(null, row);
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });
}

/**
 * generateRandomToken:
 *   Creates a random base62 string of given length for short tokens.
 */
function generateRandomToken(length = 8) {
  const crypto = require('crypto');
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const charLen = chars.length;
  const maxValidByte = 256 - (256 % charLen);
  let result = '';

  while (result.length < length) {
    const byte = crypto.randomBytes(1)[0];
    if (byte >= maxValidByte) {
      continue; // Avoid modulo bias
    }
    result += chars[byte % charLen];
  }

  return result;
}

/**
 * extractFileName:
 *   e.g. "public/images/mycat.png" => "mycat.png"
 */
function extractFileName(filePath) {
  return normalizeSharePath(filePath).split('/').pop();
}

module.exports._internals = {
  actorIdFromPayload,
  assertSharePayload,
  normalizeSharePath,
  normalizeShortToken,
  setupShareEventListeners
};
