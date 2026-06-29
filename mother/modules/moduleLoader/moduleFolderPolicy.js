const fs = require('fs');
const path = require('path');
const { isCoreOwnedModule } = require('./moduleOwnershipPolicy');
const { normalizeModuleInfoAccess } = require('./moduleAccessPolicy');

const FORBIDDEN_COMMUNITY_MODULE_FILENAMES = new Set([
  '.env',
  '.env.local',
  '.npmrc',
  '.yarnrc',
  'bun.lock',
  'bun.lockb',
  'npm-shrinkwrap.json',
  'package-lock.json',
  'package.json',
  'pnpm-lock.yaml',
  'yarn.lock'
]);
const FORBIDDEN_COMMUNITY_MODULE_DIRNAMES = new Set([
  'node_modules'
]);
const FORBIDDEN_COMMUNITY_MODULE_ROOT_DIRNAMES = new Set([
  'apps',
  'mother',
  'public',
  'ui',
  'widgets'
]);
const FORBIDDEN_COMMUNITY_MODULE_INFO_FIELDS = new Map([
  ['appName', 'app identity'],
  ['appType', 'app identity'],
  ['widgetId', 'widget identity'],
  ['widgetType', 'widget identity']
]);
const VALID_COMMUNITY_MODULE_NAME = /^[A-Za-z0-9_-]+$/;

function isForbiddenCommunityModuleFilename(filename = '') {
  const normalized = String(filename || '').trim().toLowerCase();
  return FORBIDDEN_COMMUNITY_MODULE_FILENAMES.has(normalized) || /^\.env(?:\.|$)/i.test(normalized);
}

function assertCommunityModuleName(moduleName = '') {
  const safeModuleName = String(moduleName || '').trim();
  if (!VALID_COMMUNITY_MODULE_NAME.test(safeModuleName)) {
    throw new Error(`Invalid community module name "${moduleName}". Module names may contain only letters, numbers, underscores and hyphens.`);
  }
  return safeModuleName;
}

function assertInside(baseDir, candidatePath, label = 'path') {
  const root = path.resolve(baseDir);
  const resolved = path.resolve(candidatePath);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  const compareRoot = process.platform === 'win32' ? root.toLowerCase() : root;
  const compareResolved = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const compareRootPrefix = process.platform === 'win32' ? rootPrefix.toLowerCase() : rootPrefix;
  if (compareResolved !== compareRoot && !compareResolved.startsWith(compareRootPrefix)) {
    throw new Error(`[MODULE LOADER] ${label} escapes modules root.`);
  }
  return resolved;
}

function assertRealPathInside(baseDir, candidatePath, label = 'path') {
  const resolved = assertInside(baseDir, candidatePath, label);
  if (!fs.existsSync(resolved)) {
    return resolved;
  }
  const realRoot = fs.realpathSync(baseDir);
  const realCandidate = fs.realpathSync(resolved);
  return assertInside(realRoot, realCandidate, label);
}

function assertCommunityModuleFolderShape(moduleFolderPath, moduleName, options = {}) {
  const safeModuleName = assertCommunityModuleName(moduleName || path.basename(moduleFolderPath));
  const modulesRoot = path.resolve(options.modulesRoot || path.dirname(moduleFolderPath));
  const resolvedModuleFolder = assertInside(modulesRoot, moduleFolderPath, 'module folder');

  let rootStats;
  try {
    rootStats = fs.lstatSync(resolvedModuleFolder);
  } catch {
    throw new Error(`Module "${safeModuleName}" folder must exist.`);
  }
  if (rootStats.isSymbolicLink()) {
    throw new Error(`Module "${safeModuleName}" cannot contain symlinks or junctions.`);
  }
  if (!rootStats.isDirectory()) {
    throw new Error(`Module "${safeModuleName}" folder must be a directory.`);
  }

  const moduleRoot = assertRealPathInside(modulesRoot, resolvedModuleFolder, 'module folder');
  const rootModuleInfo = path.resolve(moduleRoot, 'moduleInfo.json');
  const stack = [moduleRoot];
  while (stack.length) {
    const currentDir = stack.pop();
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      const entryStats = fs.lstatSync(entryPath);
      const filename = entry.name.toLowerCase();

      if (filename === 'app.json') {
        throw new Error(`Module "${safeModuleName}" cannot contain app.json. Apps must be installed through appLoader.`);
      }
      if (filename === 'widgetinfo.json') {
        throw new Error(`Module "${safeModuleName}" cannot contain widgetInfo.json. Widgets must be installed through widgetManager.`);
      }
      if (isForbiddenCommunityModuleFilename(filename)) {
        throw new Error(`Module "${safeModuleName}" cannot contain ${entry.name}. Community modules cannot bring package managers, dependency lockfiles or env files.`);
      }
      if (filename === 'moduleinfo.json' && path.resolve(entryPath) !== rootModuleInfo) {
        throw new Error(`Module "${safeModuleName}" cannot contain nested moduleInfo.json. Modules must be installed as one module folder.`);
      }
      if (entryStats.isSymbolicLink()) {
        throw new Error(`Module "${safeModuleName}" cannot contain symlinks or junctions.`);
      }
      if (entryStats.isDirectory()) {
        if (FORBIDDEN_COMMUNITY_MODULE_DIRNAMES.has(filename)) {
          throw new Error(`Module "${safeModuleName}" cannot contain runtime dependency folder "${entry.name}".`);
        }
        if (path.resolve(currentDir) === moduleRoot && FORBIDDEN_COMMUNITY_MODULE_ROOT_DIRNAMES.has(filename)) {
          throw new Error(`Module "${safeModuleName}" cannot contain host folder "${entry.name}". Apps, widgets and system UI must use their own loaders.`);
        }
        stack.push(entryPath);
      }
    }
  }

  return moduleRoot;
}

function assertCommunityModuleInfoRole(moduleInfo = {}, moduleName = '') {
  const safeModuleName = assertCommunityModuleName(moduleName || moduleInfo.moduleName);
  for (const [field, label] of FORBIDDEN_COMMUNITY_MODULE_INFO_FIELDS.entries()) {
    if (
      Object.prototype.hasOwnProperty.call(moduleInfo, field) &&
      moduleInfo[field] !== undefined &&
      moduleInfo[field] !== null &&
      moduleInfo[field] !== ''
    ) {
      throw new Error(`moduleInfo.json for "${safeModuleName}" cannot declare ${field}; modules cannot claim ${label}.`);
    }
  }
  if (isCoreOwnedModule(safeModuleName)) {
    throw new Error(`Module "${safeModuleName}" is owned by the core and cannot be managed as a community module.`);
  }

  if (moduleInfo.moduleType !== undefined && moduleInfo.moduleType !== null && moduleInfo.moduleType !== '') {
    const declaredType = String(moduleInfo.moduleType).trim().toLowerCase();
    if (declaredType !== 'community') {
      throw new Error(`moduleInfo.moduleType for "${safeModuleName}" must be "community" or omitted. Core modules live under mother/modules.`);
    }
  }
}

function readCommunityModuleInfo(moduleFolderPath, moduleName, options = {}) {
  const safeModuleName = assertCommunityModuleName(moduleName || path.basename(moduleFolderPath));
  const moduleRoot = assertCommunityModuleFolderShape(moduleFolderPath, safeModuleName, options);
  const infoPath = path.join(moduleRoot, 'moduleInfo.json');
  if (!fs.existsSync(infoPath)) {
    throw new Error(`Module "${safeModuleName}" must include moduleInfo.json.`);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
  } catch (err) {
    throw new Error(`Invalid moduleInfo.json for "${safeModuleName}": ${err.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`moduleInfo.json for "${safeModuleName}" must be a JSON object.`);
  }
  if (!parsed.moduleName) {
    throw new Error(`moduleInfo.json for "${safeModuleName}" must declare moduleName.`);
  }
  assertCommunityModuleName(parsed.moduleName);
  if (parsed.moduleName !== safeModuleName) {
    throw new Error(`moduleInfo.moduleName "${parsed.moduleName}" does not match folder "${safeModuleName}".`);
  }
  assertCommunityModuleInfoRole(parsed, safeModuleName);

  return normalizeModuleInfoAccess({
    ...parsed,
    moduleName: safeModuleName,
    developer: parsed.developer || 'Unknown Developer',
    version: parsed.version || '',
    description: parsed.description || ''
  }, safeModuleName);
}

module.exports = {
  FORBIDDEN_COMMUNITY_MODULE_DIRNAMES,
  FORBIDDEN_COMMUNITY_MODULE_FILENAMES,
  FORBIDDEN_COMMUNITY_MODULE_INFO_FIELDS,
  FORBIDDEN_COMMUNITY_MODULE_ROOT_DIRNAMES,
  VALID_COMMUNITY_MODULE_NAME,
  assertCommunityModuleName,
  isForbiddenCommunityModuleFilename,
  assertCommunityModuleFolderShape,
  assertCommunityModuleInfoRole,
  assertInside,
  assertRealPathInside,
  readCommunityModuleInfo
};
