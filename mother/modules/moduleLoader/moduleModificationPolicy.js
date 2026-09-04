'use strict';

const fs = require('fs');
const path = require('path');
const {
  assertCommunityModuleName,
  assertInside,
  isForbiddenCommunityModuleFilename
} = require('./moduleFolderPolicy');

const DEFAULT_MODIFICATION_ROOT = path.resolve(__dirname, '../../../data/module-overrides');
const MODIFICATION_SOURCE = 'user-overrides';
const FORBIDDEN_MODIFICATION_FILENAMES = new Set([
  'app.json',
  'index.js',
  'moduleinfo.json',
  'widgetinfo.json'
]);
const FORBIDDEN_MODIFICATION_DIRNAMES = new Set([
  'node_modules'
]);
const FORBIDDEN_MODIFICATION_ROOT_DIRNAMES = new Set([
  'apps',
  'mother',
  'public',
  'ui',
  'widgets'
]);
const DEFAULT_OVERRIDABLE_PATHS = Object.freeze(['frontend']);

function createModificationError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

function modificationRoot(options = {}) {
  return path.resolve(options.modificationRoot || DEFAULT_MODIFICATION_ROOT);
}

function modificationDisplayPath(moduleName) {
  return `data/module-overrides/${moduleName}`;
}

function resolveModuleModificationDir(moduleName, options = {}) {
  const safeModuleName = assertCommunityModuleName(moduleName);
  const root = modificationRoot(options);
  return assertInside(root, path.join(root, safeModuleName), 'module modification folder');
}

function normalizeOverrideRelativePath(value, label = 'module override path') {
  const raw = String(value || '');
  const normalized = raw.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const segments = normalized.split('/').filter(Boolean);
  if (
    !segments.length ||
    normalized.includes('\0') ||
    path.isAbsolute(raw) ||
    segments.some(segment => segment === '.' || segment === '..')
  ) {
    throw createModificationError(
      'E_MODULE_OVERRIDE_PATH_INVALID',
      `${label} must be a non-empty relative path without traversal.`
    );
  }
  return segments.join('/');
}

function normalizeOverridablePaths(moduleInfo = {}) {
  const declared = moduleInfo?.overridablePaths;
  const values = declared === undefined
    ? (moduleInfo?.staticFrontend === true ? DEFAULT_OVERRIDABLE_PATHS : [])
    : declared;
  if (!Array.isArray(values)) {
    throw createModificationError(
      'E_MODULE_OVERRIDE_DECLARATION_INVALID',
      'moduleInfo.overridablePaths must be an array of relative directory paths.'
    );
  }
  return [...new Set(values.map(value => normalizeOverrideRelativePath(value, 'overridable path')))];
}

function overridePathIsDeclared(requestedPath, declaredPaths) {
  return declaredPaths.some(allowed => (
    requestedPath === allowed || requestedPath.startsWith(`${allowed}/`)
  ));
}

/**
 * Resolve a user-owned overlay directory without copying it into managed code.
 * Only module-declared static roots participate, keeping backend entrypoints and
 * manifests on the reviewed module update path.
 */
function resolveModuleOverrideDir(moduleName, requestedDir, moduleInfo = {}, options = {}) {
  const safeModuleName = assertCommunityModuleName(moduleName);
  const relativeDir = normalizeOverrideRelativePath(requestedDir, 'requested override directory');
  const declaredPaths = normalizeOverridablePaths(moduleInfo);
  if (!overridePathIsDeclared(relativeDir, declaredPaths)) return null;

  const summary = readModuleModificationSummary(safeModuleName, options);
  if (!summary.hasModification) return null;

  const moduleOverrideRoot = resolveModuleModificationDir(safeModuleName, options);
  const candidate = assertInside(
    moduleOverrideRoot,
    path.resolve(moduleOverrideRoot, relativeDir),
    'module override directory'
  );
  if (!fs.existsSync(candidate)) return null;

  const stats = fs.lstatSync(candidate);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw createModificationError(
      'E_MODULE_OVERRIDE_NOT_DIRECTORY',
      `Module "${safeModuleName}" override "${relativeDir}" must be a real directory.`
    );
  }
  const realRoot = fs.realpathSync(moduleOverrideRoot);
  const realCandidate = fs.realpathSync(candidate);
  return assertInside(realRoot, realCandidate, 'module override directory');
}

function assertModificationEntryAllowed(entry, currentDir, moduleRoot, safeModuleName) {
  const lowerName = String(entry.name || '').trim().toLowerCase();

  if (entry.isSymbolicLink()) {
    throw createModificationError(
      'E_MODULE_MODIFICATION_SYMLINK',
      `Module "${safeModuleName}" modification cannot contain symlinks or junctions.`
    );
  }
  if (isForbiddenCommunityModuleFilename(lowerName) || FORBIDDEN_MODIFICATION_FILENAMES.has(lowerName)) {
    throw createModificationError(
      'E_MODULE_MODIFICATION_FORBIDDEN_FILE',
      `Module "${safeModuleName}" modification cannot contain "${entry.name}".`
    );
  }
  if (entry.isDirectory()) {
    if (FORBIDDEN_MODIFICATION_DIRNAMES.has(lowerName)) {
      throw createModificationError(
        'E_MODULE_MODIFICATION_FORBIDDEN_DIR',
        `Module "${safeModuleName}" modification cannot contain "${entry.name}".`
      );
    }
    if (
      path.resolve(currentDir) === moduleRoot &&
      FORBIDDEN_MODIFICATION_ROOT_DIRNAMES.has(lowerName)
    ) {
      throw createModificationError(
        'E_MODULE_MODIFICATION_HOST_DIR',
        `Module "${safeModuleName}" modification cannot contain host folder "${entry.name}".`
      );
    }
  }
}

function inspectModificationFiles(moduleDir, safeModuleName) {
  const stack = [moduleDir];
  let fileCount = 0;

  while (stack.length) {
    const currentDir = stack.pop();
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      assertModificationEntryAllowed(entry, currentDir, moduleDir, safeModuleName);
      const entryPath = path.join(currentDir, entry.name);
      const realEntry = fs.realpathSync(entryPath);
      assertInside(moduleDir, realEntry, 'module modification entry');
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile()) {
        fileCount += 1;
      }
    }
  }

  return fileCount;
}

function readModuleModificationSummary(moduleName, options = {}) {
  const safeModuleName = assertCommunityModuleName(moduleName);
  const moduleDir = resolveModuleModificationDir(safeModuleName, options);
  const summaryBase = {
    source: MODIFICATION_SOURCE,
    path: modificationDisplayPath(safeModuleName)
  };

  if (!fs.existsSync(moduleDir)) {
    return {
      ...summaryBase,
      hasModification: false,
      valid: true,
      fileCount: 0
    };
  }

  const stats = fs.lstatSync(moduleDir);
  if (stats.isSymbolicLink()) {
    throw createModificationError(
      'E_MODULE_MODIFICATION_SYMLINK',
      `Module "${safeModuleName}" modification folder cannot be a symlink or junction.`
    );
  }
  if (!stats.isDirectory()) {
    throw createModificationError(
      'E_MODULE_MODIFICATION_NOT_DIRECTORY',
      `Module "${safeModuleName}" modification path must be a directory.`
    );
  }

  const realRoot = fs.realpathSync(modificationRoot(options));
  const realModuleDir = fs.realpathSync(moduleDir);
  assertInside(realRoot, realModuleDir, 'module modification folder');

  const fileCount = inspectModificationFiles(realModuleDir, safeModuleName);
  return {
    ...summaryBase,
    hasModification: fileCount > 0,
    valid: true,
    fileCount
  };
}

function safeModuleModificationSummary(moduleName, options = {}) {
  try {
    return readModuleModificationSummary(moduleName, options);
  } catch (err) {
    let safeModuleName = 'invalid-module';
    try {
      safeModuleName = assertCommunityModuleName(moduleName);
    } catch {
      // Keep the UI path sanitized even when the input name is invalid.
    }
    return {
      source: MODIFICATION_SOURCE,
      path: modificationDisplayPath(safeModuleName),
      hasModification: true,
      valid: false,
      fileCount: 0,
      errorCode: err.code || 'E_MODULE_MODIFICATION_INVALID',
      errorMessage: err.message || String(err)
    };
  }
}

function applyModificationSummary(target, moduleName, options = {}) {
  const summary = options.summary || safeModuleModificationSummary(moduleName, options);
  const info = target && typeof target === 'object' ? target : {};
  return {
    ...info,
    hasModification: summary.hasModification,
    modification: summary
  };
}

module.exports = {
  DEFAULT_MODIFICATION_ROOT,
  DEFAULT_OVERRIDABLE_PATHS,
  MODIFICATION_SOURCE,
  applyModificationSummary,
  readModuleModificationSummary,
  resolveModuleOverrideDir,
  resolveModuleModificationDir,
  safeModuleModificationSummary,
  _internals: {
    assertModificationEntryAllowed,
    createModificationError,
    inspectModificationFiles,
    modificationDisplayPath,
    modificationRoot,
    normalizeOverridablePaths,
    normalizeOverrideRelativePath,
    overridePathIsDeclared
  }
};
