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

// Because meltdown events might get double-called, we import onceCallback
const { onceCallback } = require('../../emitters/motherEmitter');

const { hasPermission } = require('../userManagement/permissionUtils');

let libraryRoot;

module.exports = {
  /**
   * initialize:
   *  1) Ensures we are a core module
   *  2) Ensures DB or schema if desired
   *  3) Ensures the "library" folder is created
   *  4) Registers meltdown events
   */
  async initialize({ motherEmitter, isCore, jwt }) {
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
  if (!fs.existsSync(libraryRoot)) {
    fs.mkdirSync(libraryRoot, { recursive: true });
    console.log(`[MEDIA MANAGER] Library folder created => ${libraryRoot}`);
  } else {
    console.log('[MEDIA MANAGER] Library folder already exists =>', libraryRoot);
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

      let finalName = fileName;
      const fullPath = path.join(targetDir, finalName);
      if (fs.existsSync(fullPath)) {
        const timestamp = Date.now();
        const ext = path.extname(fileName);
        const base = path.basename(fileName, ext);
        finalName = `${base}-${timestamp}${ext}`;
      }

      const buffer = Buffer.isBuffer(fileData)
        ? fileData
        : Buffer.from(fileData, 'base64');
      fs.writeFileSync(path.join(targetDir, finalName), buffer);
      callback(null, { success: true, fileName: finalName, mimeType });
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
    if (!userId || !filePath) {
      return callback(new Error('Missing userId or filePath in makeFilePublic.'));
    }

    const { decodedJWT } = payload;

    // 2) Permission check (admins or users with media.makePublic)
    const canProceed = isAdmin || (decodedJWT && hasPermission(decodedJWT, 'media.makePublic'));
    if (!canProceed) {
      return callback(new Error('[MEDIA MANAGER] Permission denied => media.makePublic'));
    }

    // proceed
    actuallyMoveFileToPublic(motherEmitter, { jwt, userId, filePath }, callback);
  });
}

/**
 * actuallyMoveFileToPublic:
 *  1) physically moves or symlinks from "users/<id>/..." to "library/public/<filename>"
 *  2) meltdown => shareManager => createShareLink
 */
function actuallyMoveFileToPublic(motherEmitter, { jwt, userId, filePath }, callback) {
  try {
    // 1) source path
    const sourceAbs = path.join(libraryRoot, filePath);
    if (!fs.existsSync(sourceAbs)) {
      return callback(new Error(`Source file not found => ${filePath}`));
    }

    // let's place it in library/public/<basename>
    const baseName  = path.basename(filePath);
    const publicAbs = path.join(libraryRoot, 'public', baseName);

    // physically move
    fs.renameSync(sourceAbs, publicAbs);
    console.log(`[MEDIA MANAGER] Moved file from "${sourceAbs}" to "${publicAbs}"`);

    // meltdown => createShareLink
    const relativePublicPath = path.relative(libraryRoot, publicAbs); // e.g. "public/foo.jpg"
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
        // We won't fail the entire operation, the file is still public
        return callback(null, {
          success: true,
          publicPath: publicAbs,
          shareLink: null
        });
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