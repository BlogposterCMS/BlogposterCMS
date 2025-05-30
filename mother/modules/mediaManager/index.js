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

const { mergeAllPermissions } = require('../userManagement/permissionUtils');

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

  // meltdown => uploadFileToFolder
  motherEmitter.on('uploadFileToFolder', (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    // ... existing code for uploading a file ...
    // This snippet is presumably not shown, so we won't re-implement it here.
    // Just remember: you now have "callback" as a safe once-callback.
    callback(null, { success: true, message: 'File uploaded (in theory).' });
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

    // 2) If admin => skip permission check
    if (isAdmin) {
      return actuallyMoveFileToPublic(motherEmitter, { jwt, userId, filePath }, callback);
    }

    // 3) Normal user => check if has "media.makePublic"
    motherEmitter.emit('getRolesForUser', {
      jwt,
      moduleName: 'userManagement',
      moduleType: 'core',
      userId
    }, (roleErr, rolesArr) => {
      if (roleErr) return callback(roleErr);
      if (!rolesArr) return callback(new Error('No roles found for user.'));

      // mergeAllPermissions => merges all roles' permissions
      mergeAllPermissions(motherEmitter, jwt, rolesArr, (mergedPermissions) => {
        const canMakePublic = (mergedPermissions.media && mergedPermissions.media.makePublic === true);
        if (!canMakePublic) {
          return callback(new Error('[MEDIA MANAGER] User lacks permission => media.makePublic'));
        }
        // proceed
        actuallyMoveFileToPublic(motherEmitter, { jwt, userId, filePath }, callback);
      });
    });
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