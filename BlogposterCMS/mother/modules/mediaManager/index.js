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
const { ensureMediaManagerDatabase, ensureMediaTables } = require('./mediaService');
const csurf = require('csurf');
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
  'image/svg+xml',
  'text/html',
  'text/css',
  'application/javascript'
];

const EXTENSION_MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript'
};

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
      console.error('[MEDIA MANAGER] Must be loaded as a core module. Aborting meltdown.');
      return;
    }
    if (!jwt) {
      console.error('[MEDIA MANAGER] No JWT provided, cannot proceed. The meltdown is off.');
      return;
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

      if (app) {
        setupUploadRoute(app);
      }

      console.log('[MEDIA MANAGER] Ready!');
    } catch (err) {
      console.error('[MEDIA MANAGER] Error =>', err.message);
    }
  }
};

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
      const { jwt, subPath } = payload || {};
      if (!jwt) {
        return callback(new Error('[MEDIA MANAGER] listLocalFolder => missing jwt.'));
      }

      const targetPath = path.join(libraryRoot, subPath || '');
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
      if (subPath) {
        const parts = subPath.split(path.sep).filter(Boolean);
        parts.pop();
        parentPath = parts.join(path.sep);
      }

      callback(null, {
        currentPath: subPath || '',
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
      const { jwt, currentPath = '', newFolderName } = payload || {};
      if (!jwt || !newFolderName) {
        return callback(new Error('[MEDIA MANAGER] createLocalFolder => missing parameters.'));
      }

      const targetDir = path.join(libraryRoot, currentPath, newFolderName);
      if (!targetDir.startsWith(libraryRoot)) {
        return callback(new Error('Invalid path.'));
      }

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
      const { jwt, currentPath = '', oldName, newName } = payload || {};
      if (!jwt || !oldName || !newName) {
        return callback(new Error('[MEDIA MANAGER] renameLocalItem => missing parameters.'));
      }

      const oldPath = path.join(libraryRoot, currentPath, oldName);
      const newPath = path.join(libraryRoot, currentPath, newName);
      if (!oldPath.startsWith(libraryRoot) || !newPath.startsWith(libraryRoot)) {
        return callback(new Error('Invalid path.'));
      }

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
      const { jwt, currentPath = '', itemName } = payload || {};
      if (!jwt || !itemName) {
        return callback(new Error('[MEDIA MANAGER] deleteLocalItem => missing parameters.'));
      }

      const target = path.join(libraryRoot, currentPath, itemName);
      if (!target.startsWith(libraryRoot)) {
        return callback(new Error('Invalid path.'));
      }

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
      const {
        jwt,
        fileName,
        fileData,
        subPath = '',
        mimeType
      } = payload || {};
      if (!jwt || !fileName || !fileData) {
        return callback(new Error('[MEDIA MANAGER] uploadFileToFolder => missing parameters.'));
      }

      const targetDir = path.join(libraryRoot, subPath);
      if (!targetDir.startsWith(libraryRoot)) {
        return callback(new Error('Invalid path.'));
      }
      fs.mkdirSync(targetDir, { recursive: true });

      let finalName = path.basename(fileName);
      const ext = path.extname(finalName).toLowerCase();
      const resolvedMime = EXTENSION_MIME_MAP[ext];
      if (!resolvedMime) {
        return callback(new Error('[MEDIA MANAGER] uploadFileToFolder => disallowed file type.'));
      }

      const fullPath = path.join(targetDir, finalName);
      if (fs.existsSync(fullPath)) {
        const timestamp = Date.now();
        const base = path.basename(finalName, ext);
        finalName = `${base}-${timestamp}${ext}`;
      }

      const buffer = Buffer.isBuffer(fileData)
        ? fileData
        : Buffer.from(fileData, 'base64');
      fs.writeFileSync(path.join(targetDir, finalName), buffer);
      callback(null, { success: true, fileName: finalName, mimeType: resolvedMime });
    } catch (err) {
      callback(err);
    }
  });

  /*
   * meltdown => makeFilePublic
   * checks - user roles or isAdmin
   * physically moves the file to /public
   * meltdown => shareManager => createShareLink
   */
  motherEmitter.on('makeFilePublic', (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    console.log('[MEDIA MANAGER] "makeFilePublic" event =>', payload);
    const { jwt, moduleName, moduleType, userId, filePath, isAdmin } = payload || {};

    // 1) Basic meltdown checks
    if (!jwt || moduleName !== 'mediaManager' || moduleType !== 'core') {
      return callback(new Error('[MEDIA MANAGER] makeFilePublic => invalid meltdown payload.'));
    }

    const { decodedJWT } = payload;
    const resolvedUserId = userId || decodedJWT?.user?.id;

    if (!resolvedUserId || !filePath) {
      return callback(new Error('Missing userId or filePath in makeFilePublic.'));
    }

    // 2) Permission check (admins or users with media.makePublic)
    const canProceed = isAdmin || (decodedJWT && hasPermission(decodedJWT, 'media.makePublic'));
    if (!canProceed) {
      return callback(new Error('[MEDIA MANAGER] Permission denied => media.makePublic'));
    }

    // proceed
    actuallyMoveFileToPublic(motherEmitter, { jwt, userId: resolvedUserId, filePath }, callback);
  });
}

function setupUploadRoute(app) {
  const csrfProtection = csurf({ cookie: { httpOnly: true, sameSite: 'strict' } });

  app.post('/admin/api/upload', requireAuthCookie, csrfProtection, createUpload({
    fieldName: 'file',
    destResolver: (req, filename) => {
      const sub = decodeURIComponent(req.query.subPath || '');
      const target = path.join(libraryRoot, sub);
      if (!target.startsWith(libraryRoot)) throw new Error('Invalid path');
      return target;
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
    const normalized = path.normalize(filePath).replace(/^([\.\/]+)+/, '');
    const sourceAbs = path.join(libraryRoot, normalized);
    const publicRoot = path.join(libraryRoot, 'public');
    if (!sourceAbs.startsWith(libraryRoot) || !fs.existsSync(sourceAbs)) {
      return callback(new Error(`Source file not found or outside library => ${filePath}`));
    }

    const publicAbs = path.join(publicRoot, normalized);
    if (!publicAbs.startsWith(publicRoot)) {
      return callback(new Error('Invalid destination path.'));
    }

    fs.mkdirSync(path.dirname(publicAbs), { recursive: true });
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