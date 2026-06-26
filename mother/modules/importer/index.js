/**
 * modules/importer/index.js
 *
 * Loads importer mappings from ./importers and exposes them via meltdown events.
 * Importers can handle WordPress, HTML themes, and more.
 */
const fs = require('fs');
const path = require('path');
// Import onceCallback utility from the central motherEmitter
const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');

const MODULE_NAME = 'importer';
const MODULE_TYPE = 'core';
const DEFAULT_IMPORT_ROOTS = [
  path.resolve(__dirname, '../../../temp_uploads/imports'),
  path.resolve(__dirname, '../../../data/imports')
];
const CONTROL_OPTION_KEYS = new Set([
  'motherEmitter',
  'jwt',
  'decodedJWT',
  'importPayload',
  'themeBaseDir'
]);

function importerEnv() {
  return (typeof process !== 'undefined' && process.env) ? process.env : {};
}

function configuredImportRoots() {
  const env = importerEnv();
  const configured = String(env.BLOGPOSTER_IMPORT_ROOTS || env.IMPORT_STAGING_DIR || '')
    .split(path.delimiter)
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => path.resolve(entry));
  return [...configured, ...DEFAULT_IMPORT_ROOTS];
}

function realOrResolved(target) {
  try {
    return fs.realpathSync.native(target);
  } catch {
    return path.resolve(target);
  }
}

function isInside(parent, target) {
  const resolvedParent = realOrResolved(parent);
  const resolvedTarget = realOrResolved(target);
  return resolvedTarget === resolvedParent || resolvedTarget.startsWith(resolvedParent + path.sep);
}

function assertInsideImportRoots(rawPath, label) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) return rawPath;
  const resolvedPath = path.resolve(rawPath);
  const roots = configuredImportRoots();
  if (!roots.some(root => isInside(root, resolvedPath))) {
    throw new Error(`[importer] ${label} must be inside an import staging root.`);
  }
  return resolvedPath;
}

function assertImporterPayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[importer] ${eventName} requires importer core scope.`);
  }
}

function assertPlainOptions(options) {
  if (typeof options === 'undefined' || options === null) return {};
  const isBuffer = typeof Buffer !== 'undefined' && Buffer.isBuffer(options);
  if (typeof options !== 'object' || Array.isArray(options) || isBuffer) {
    throw new Error('[importer] runImport options must be an object.');
  }
  return options;
}

function sanitizeRunImportOptions(importerName, options = {}) {
  const source = assertPlainOptions(options);
  for (const key of CONTROL_OPTION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      throw new Error(`[importer] runImport options cannot override ${key}.`);
    }
  }

  const sanitized = { ...source };
  if (importerName === 'wordpress') {
    if (sanitized.filePath) {
      sanitized.filePath = assertInsideImportRoots(sanitized.filePath, 'options.filePath');
    }
    if (sanitized.path) {
      sanitized.path = assertInsideImportRoots(sanitized.path, 'options.path');
    }
  }
  if (importerName === 'htmlTheme') {
    if (sanitized.sourceDir) {
      sanitized.sourceDir = assertInsideImportRoots(sanitized.sourceDir, 'options.sourceDir');
    }
    if (sanitized.dir) {
      sanitized.dir = assertInsideImportRoots(sanitized.dir, 'options.dir');
    }
    if (sanitized.path) {
      sanitized.path = assertInsideImportRoots(sanitized.path, 'options.path');
    }
  }
  if (importerName === 'wordpressSitePackage') {
    if (sanitized.packageDir) {
      sanitized.packageDir = assertInsideImportRoots(sanitized.packageDir, 'options.packageDir');
    }
    if (sanitized.sourceDir) {
      sanitized.sourceDir = assertInsideImportRoots(sanitized.sourceDir, 'options.sourceDir');
    }
    if (sanitized.dir) {
      sanitized.dir = assertInsideImportRoots(sanitized.dir, 'options.dir');
    }
    if (sanitized.path) {
      sanitized.path = assertInsideImportRoots(sanitized.path, 'options.path');
    }
    if (sanitized.filePath) {
      sanitized.filePath = assertInsideImportRoots(sanitized.filePath, 'options.filePath');
    }
    if (sanitized.zipPath) {
      sanitized.zipPath = assertInsideImportRoots(sanitized.zipPath, 'options.zipPath');
    }
  }
  return sanitized;
}

function loadImporters(dir) {
  const map = {};
  if (!fs.existsSync(dir)) return map;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.js')) continue;
    try {
      const imp = require(path.join(dir, file));
      if (imp && imp.name && typeof imp.import === 'function') {
        map[imp.name] = imp;
      }
    } catch (e) {
      console.error(`[IMPORTER] Failed to load ${file}:`, e.message);
    }
  }
  return map;
}

module.exports = {
  async initialize({ motherEmitter, isCore, jwt }) {
    if (!isCore) {
      throw new Error('[IMPORTER] Must be loaded as a core module.');
    }
    if (!jwt) {
      throw new Error('[IMPORTER] initialization requires a valid JWT token.');
    }
    if (!motherEmitter) {
      throw new Error('[IMPORTER] motherEmitter missing.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }
    console.log('[IMPORTER] Initializing...');

    const baseDir = path.join(__dirname, 'importers');
    const importers = loadImporters(baseDir);

    motherEmitter.on('listImporters', (payload, cb) => {
      cb = onceCallback(cb);
      try {
        assertImporterPayload(payload, 'listImporters');
      } catch (err) {
        return cb(err);
      }
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'importers.list')) {
        return cb(new Error('Forbidden - missing permission: importers.list'));
      }
      cb(null, Object.keys(importers));
    });

    motherEmitter.on('runImport', async (payload, cb) => {
      cb = onceCallback(cb);
      const { jwt: callerJwt, importerName, options = {} } = payload || {};
      try {
        assertImporterPayload(payload, 'runImport');
      } catch (err) {
        return cb(err);
      }
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'importers.run')) {
        return cb(new Error('Forbidden - missing permission: importers.run'));
      }
      const importer = importers[importerName];
      if (!importer) {
        return cb(new Error(`Unknown importer: ${importerName}`));
      }
      try {
        const safeOptions = sanitizeRunImportOptions(importerName, options);
        const result = await importer.import({
          ...safeOptions,
          motherEmitter,
          jwt: callerJwt,
          decodedJWT: payload.decodedJWT || null,
          importPayload: payload
        });
        cb(null, result);
      } catch (e) {
        cb(e);
      }
    });

    console.log('[IMPORTER] Ready.');
  }
};
