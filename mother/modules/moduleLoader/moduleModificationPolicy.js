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
  MODIFICATION_SOURCE,
  applyModificationSummary,
  readModuleModificationSummary,
  resolveModuleModificationDir,
  safeModuleModificationSummary,
  _internals: {
    assertModificationEntryAllowed,
    createModificationError,
    inspectModificationFiles,
    modificationDisplayPath,
    modificationRoot
  }
};
