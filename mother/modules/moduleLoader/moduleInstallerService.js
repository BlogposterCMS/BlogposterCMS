/**
 * mother/modules/moduleLoader/moduleInstallerService.js
 *
 * 1) Saves an uploaded ZIP
 * 2) Extracts it into /modules/{modName}
 * 3) Check for moduleInfo.json
 * 4) Insert or update module_registry
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { sanitizeModuleName } = require('../../utils/moduleUtils');
const {
  insertModuleRegistryEntry,
  updateModuleLastError
} = require('./moduleRegistryService');
const { isCoreOwnedModule } = require('./moduleOwnershipPolicy');
const {
  assertCommunityModuleFolderShape,
  assertCommunityModuleInfoRole
} = require('./moduleFolderPolicy');
const {
  normalizeModuleInfoAccess
} = require('./moduleAccessPolicy');

const REQUIRED_MODULE_INFO_FIELDS = ['moduleName', 'version', 'developer', 'description'];
const FORBIDDEN_TOP_LEVEL_ARCHIVE_SEGMENTS = new Set([
  '.git',
  '.github',
  'apps',
  'mother',
  'public',
  'ui',
  'widgets'
]);
const FORBIDDEN_ARCHIVE_SEGMENTS = new Set(['node_modules']);
const FORBIDDEN_ARCHIVE_FILENAMES = new Set([
  '.env',
  '.env.local',
  '.npmrc',
  '.yarnrc',
  'app.json',
  'bun.lock',
  'bun.lockb',
  'npm-shrinkwrap.json',
  'package-lock.json',
  'package.json',
  'pnpm-lock.yaml',
  'widgetinfo.json',
  'yarn.lock'
]);

function isForbiddenArchiveFilename(filename = '') {
  const normalized = String(filename || '').trim().toLowerCase();
  return FORBIDDEN_ARCHIVE_FILENAMES.has(normalized) || /^\.env(?:\.|$)/i.test(normalized);
}

function assertInside(baseDir, candidatePath, label = 'path') {
  const root = path.resolve(baseDir);
  const resolved = path.resolve(candidatePath);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  const compareRoot = process.platform === 'win32' ? root.toLowerCase() : root;
  const compareResolved = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const compareRootPrefix = process.platform === 'win32' ? rootPrefix.toLowerCase() : rootPrefix;
  if (compareResolved !== compareRoot && !compareResolved.startsWith(compareRootPrefix)) {
    throw new Error(`[MODULE INSTALLER] ${label} must stay inside the target root.`);
  }
  return resolved;
}

function normalizeArchiveEntryName(entryName = '') {
  const rawName = String(entryName || '').replace(/\\/g, '/');
  if (!rawName || rawName.includes('\0')) {
    throw new Error('[MODULE INSTALLER] Invalid ZIP entry name.');
  }
  if (rawName.startsWith('/') || /^[A-Za-z]:\//.test(rawName)) {
    throw new Error('[MODULE INSTALLER] ZIP entries must use relative paths.');
  }
  const normalized = path.posix.normalize(rawName);
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized === '..') {
    throw new Error('[MODULE INSTALLER] ZIP entry escapes the archive root.');
  }
  return normalized;
}

function isZipEntrySymlink(entry) {
  const attr = Number(entry?.header?.attr || 0);
  return ((attr >>> 16) & 0o170000) === 0o120000;
}

function assertSafeArchiveEntry(entry) {
  const normalized = normalizeArchiveEntryName(entry.entryName);
  if (isZipEntrySymlink(entry)) {
    throw new Error('[MODULE INSTALLER] ZIP symlinks are not allowed.');
  }
  const segments = normalized.split('/').filter(Boolean);
  for (const [index, segment] of segments.entries()) {
    if (segment === '..') {
      throw new Error('[MODULE INSTALLER] ZIP entry escapes the archive root.');
    }
    const lower = segment.toLowerCase();
    if (index === 0 && FORBIDDEN_TOP_LEVEL_ARCHIVE_SEGMENTS.has(lower)) {
      throw new Error(`[MODULE INSTALLER] ZIP cannot contain top-level "${segment}" directories.`);
    }
    if (FORBIDDEN_ARCHIVE_SEGMENTS.has(lower)) {
      throw new Error(`[MODULE INSTALLER] ZIP cannot contain "${segment}" directories.`);
    }
  }
  const fileName = segments[segments.length - 1]?.toLowerCase() || '';
  if (isForbiddenArchiveFilename(fileName)) {
    throw new Error(`[MODULE INSTALLER] ZIP cannot contain "${fileName}".`);
  }
  return normalized;
}

function validateZipEntries(zip) {
  const entries = zip.getEntries();
  if (!entries.length) {
    throw new Error('[MODULE INSTALLER] Uploaded ZIP is empty.');
  }
  for (const entry of entries) {
    assertSafeArchiveEntry(entry);
  }
  return entries;
}

function validateModuleInfo(moduleInfo = {}) {
  for (const field of REQUIRED_MODULE_INFO_FIELDS) {
    if (!moduleInfo[field]) {
      throw new Error(`moduleInfo.json missing "${field}" field.`);
    }
  }

  const moduleName = sanitizeModuleName(String(moduleInfo.moduleName).trim());
  if (isCoreOwnedModule(moduleName)) {
    throw new Error(`Module "${moduleName}" is owned by the core and cannot be installed as a community module.`);
  }
  assertCommunityModuleInfoRole(moduleInfo, moduleName);

  return normalizeModuleInfoAccess({
    ...moduleInfo,
    moduleName,
    version: String(moduleInfo.version).trim(),
    developer: String(moduleInfo.developer).trim(),
    description: String(moduleInfo.description).trim()
  }, moduleName);
}

function emitAsync(motherEmitter, eventName, payload) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(eventName, payload, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

async function ensureModulePermissionDeclarations(motherEmitter, jwt, moduleInfo = {}) {
  const declarations = Array.isArray(moduleInfo.permissions) ? moduleInfo.permissions : [];
  if (!declarations.length) return;

  const existingRows = await emitAsync(motherEmitter, 'dbSelect', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    table: 'permissions'
  });
  const existing = new Set((Array.isArray(existingRows) ? existingRows : [])
    .map(row => String(row.permission_key || '')));

  for (const declaration of declarations) {
    const key = declaration.permission_key || declaration.key;
    if (!key || existing.has(key)) continue;
    await emitAsync(motherEmitter, 'dbInsert', {
      jwt,
      moduleName: 'userManagement',
      moduleType: 'core',
      table: 'permissions',
      data: {
        permission_key: key,
        description: declaration.description || key,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });
    existing.add(key);
  }
}

function validateModuleDirectory(foundModuleDir, moduleInfo, extractedRoot) {
  const moduleDir = assertInside(extractedRoot, foundModuleDir, 'module folder');
  const indexPath = assertInside(moduleDir, path.join(moduleDir, 'index.js'), 'module entry');
  if (!fs.existsSync(indexPath) || !fs.statSync(indexPath).isFile()) {
    throw new Error('Uploaded module must include index.js next to moduleInfo.json.');
  }

  const appManifestPath = path.join(moduleDir, 'app.json');
  if (fs.existsSync(appManifestPath)) {
    throw new Error('Module ZIP cannot contain app.json. Apps must be installed through appLoader.');
  }

  const folderName = path.basename(moduleDir);
  if (folderName !== moduleInfo.moduleName) {
    throw new Error(`Module folder "${folderName}" must match moduleInfo.moduleName "${moduleInfo.moduleName}".`);
  }
  assertCommunityModuleFolderShape(moduleDir, moduleInfo.moduleName, { modulesRoot: path.dirname(moduleDir) });

  const apiDefinitionPath = path.join(moduleDir, 'apiDefinition.json');
  if (fs.existsSync(apiDefinitionPath)) {
    JSON.parse(fs.readFileSync(apiDefinitionPath, 'utf8'));
  }

  return moduleDir;
}

async function installModuleFromZip(motherEmitter, jwt, uploadedZipBuffer, options = {}) {
  let tempZipPath = null;
  let extractedTemp = null;
  try {
    // 1) Save ZIP to temp
    const tempDir = path.resolve(options.tempDir || path.resolve(__dirname, '../../../temp_uploads'));
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    tempZipPath = path.join(tempDir, `moduleUpload_${Date.now()}.zip`);
    fs.writeFileSync(tempZipPath, uploadedZipBuffer);

    // 2) Extract
    const zip = new AdmZip(tempZipPath);
    validateZipEntries(zip);
    extractedTemp = path.join(tempDir, `unzipped_${Date.now()}`);
    fs.mkdirSync(extractedTemp, { recursive: true });
    zip.extractAllTo(extractedTemp, true);

    // 2.1) find moduleInfo.json
    const { foundModuleDir, moduleInfo } = findModuleInfo(extractedTemp);
    if (!foundModuleDir || !moduleInfo) {
      throw new Error('No moduleInfo.json found in the uploaded ZIP.');
    }
    const baseModuleInfo = validateModuleInfo(moduleInfo);
    const normalizedModuleInfo = normalizeModuleInfoAccess(
      baseModuleInfo,
      baseModuleInfo.moduleName,
      {
        approvedAccess: options.approvedAccess || [],
        grantedBy: options.grantedBy
      }
    );
    const moduleSourceDir = validateModuleDirectory(foundModuleDir, normalizedModuleInfo, extractedTemp);

    // 3) Move to final /modules folder
    const modulesRoot = path.resolve(options.modulesRoot || path.resolve(__dirname, '../../../modules'));
    fs.mkdirSync(modulesRoot, { recursive: true });
    const finalModuleFolder = assertInside(modulesRoot, path.join(modulesRoot, normalizedModuleInfo.moduleName), 'module install folder');
    if (fs.existsSync(finalModuleFolder)) {
      if (!options.allowOverwrite) {
        throw new Error(`Module folder '${normalizedModuleInfo.moduleName}' already exists. Overwrite not allowed.`);
      }
      fs.rmSync(finalModuleFolder, { recursive: true, force: true });
    }

    fs.renameSync(moduleSourceDir, finalModuleFolder);

    // 4) Insert or update module_registry
    await insertModuleRegistryEntry(motherEmitter, jwt, normalizedModuleInfo.moduleName, true, null, normalizedModuleInfo)
      .catch(err => {
        throw new Error(`DB Insert Registry failed: ${err.message}`);
      });
    await ensureModulePermissionDeclarations(motherEmitter, jwt, normalizedModuleInfo);

    if (options.notifyAdmin) {
      motherEmitter.emit('log', {
        level: 'info',
        message: `Module ${normalizedModuleInfo.moduleName} installed.`
      });
    }

    return { success: true, moduleName: normalizedModuleInfo.moduleName };
  } catch (err) {
    console.error('[MODULE INSTALLER] Error installing from ZIP =>', err.message);
    await updateModuleLastError(motherEmitter, jwt, '(unknown)', err.message).catch(() => {});
    throw err;
  } finally {
    if (tempZipPath && fs.existsSync(tempZipPath)) {
      fs.rmSync(tempZipPath, { force: true });
    }
    if (extractedTemp && fs.existsSync(extractedTemp)) {
      fs.rmSync(extractedTemp, { recursive: true, force: true });
    }
  }
}

function inspectModuleZipBuffer(uploadedZipBuffer) {
  const zip = new AdmZip(uploadedZipBuffer);
  const entries = validateZipEntries(zip);
  const matches = entries.filter(entry => {
    const normalized = normalizeArchiveEntryName(entry.entryName);
    return path.posix.basename(normalized).toLowerCase() === 'moduleinfo.json';
  });
  if (matches.length !== 1) {
    throw new Error('[E_MODULE_INSPECT_MANIFEST_COUNT] Uploaded ZIP must contain exactly one moduleInfo.json.');
  }

  const parsed = JSON.parse(matches[0].getData().toString('utf8'));
  const moduleInfo = validateModuleInfo(parsed);
  return {
    moduleName: moduleInfo.moduleName,
    moduleInfo,
    permissions: moduleInfo.permissions || [],
    requestedAccess: moduleInfo.requestedAccess || []
  };
}

function findModuleInfo(extractedDir) {
  const stack = [extractedDir];
  const matches = [];
  while (stack.length > 0) {
    const current = stack.pop();
    const files = fs.readdirSync(current);

    for (const fileName of files) {
      const fullPath = path.join(current, fileName);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        stack.push(fullPath);
      } else if (fileName === 'moduleInfo.json') {
        const raw = fs.readFileSync(fullPath, 'utf8');
        const parsed = JSON.parse(raw);
        matches.push({ foundModuleDir: current, moduleInfo: parsed });
      }
    }
  }
  if (matches.length > 1) {
    throw new Error('Uploaded ZIP must contain exactly one moduleInfo.json.');
  }
  return matches[0] || { foundModuleDir: null, moduleInfo: null };
}

module.exports = {
  installModuleFromZip,
  inspectModuleZipBuffer,
  ensureModulePermissionDeclarations,
  _internals: {
    assertSafeArchiveEntry,
    findModuleInfo,
    isForbiddenArchiveFilename,
    normalizeArchiveEntryName,
    inspectModuleZipBuffer,
    validateModuleDirectory,
    validateModuleInfo,
    validateZipEntries
  }
};
