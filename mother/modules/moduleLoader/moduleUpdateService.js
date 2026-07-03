'use strict';

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const AdmZip = require('adm-zip');
const { sanitizeModuleName } = require('../../utils/moduleUtils');
const {
  getModuleRegistry,
  getRegisteredModuleInfo,
  updateModuleInfo
} = require('./moduleRegistryService');
const {
  assertCommunityModuleFolderShape
} = require('./moduleFolderPolicy');
const {
  getGrantedModuleEvents,
  normalizeApprovedAccess,
  preserveTrustedAccess,
  TRUSTED_ACCESS_GRANTS_FIELD
} = require('./moduleAccessPolicy');
const {
  ensureModulePermissionDeclarations,
  _internals: installerInternals
} = require('./moduleInstallerService');
const {
  runCommunityModuleHealthCheck
} = require('./moduleProcessRuntime');

const DEFAULT_MODULES_ROOT = path.resolve(__dirname, '../../../modules');
const DEFAULT_UPDATE_TEMP_ROOT = path.resolve(__dirname, '../../../temp_uploads/module-updates');
const DEFAULT_BACKUP_ROOT = path.resolve(__dirname, '../../../data/module-backups');
const UPDATE_LOCKS = new Set();
const SAFE_GITHUB_PART = /^[A-Za-z0-9_.-]+$/;

function createModuleUpdateError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

function assertInside(baseDir, candidatePath, label = 'path') {
  const root = path.resolve(baseDir);
  const resolved = path.resolve(candidatePath);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  const compareRoot = process.platform === 'win32' ? root.toLowerCase() : root;
  const compareResolved = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const compareRootPrefix = process.platform === 'win32' ? rootPrefix.toLowerCase() : rootPrefix;
  if (compareResolved !== compareRoot && !compareResolved.startsWith(compareRootPrefix)) {
    throw createModuleUpdateError('E_MODULE_UPDATE_PATH_ESCAPE', `${label} must stay inside its update root.`);
  }
  return resolved;
}

function parseModuleInfo(value = {}) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) || {};
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' ? value : {};
}

function normalizeModuleRow(row = {}) {
  return {
    ...row,
    module_info: parseModuleInfo(row.module_info ?? row.moduleInfo)
  };
}

function normalizeTrustedUpdateSource(source = {}, moduleName = '') {
  if (!source || typeof source !== 'object' || source.enabled === false) return null;
  if (source.provider !== 'github') {
    throw createModuleUpdateError('E_MODULE_UPDATE_SOURCE_PROVIDER', `Module "${moduleName}" update source must use provider "github".`);
  }
  const owner = String(source.owner || '').trim();
  const repo = String(source.repo || '').trim();
  if (!SAFE_GITHUB_PART.test(owner) || !SAFE_GITHUB_PART.test(repo)) {
    throw createModuleUpdateError('E_MODULE_UPDATE_SOURCE_INVALID', `Module "${moduleName}" GitHub owner/repo is invalid.`);
  }
  const assetPattern = String(source.assetPattern || `${moduleName}-*.zip`).trim();
  if (!assetPattern || assetPattern.includes('/') || assetPattern.includes('\\') || !assetPattern.endsWith('.zip')) {
    throw createModuleUpdateError('E_MODULE_UPDATE_ASSET_PATTERN', `Module "${moduleName}" update asset pattern must target a ZIP filename.`);
  }
  return {
    provider: 'github',
    owner,
    repo,
    assetPattern,
    releaseChannel: source.releaseChannel === 'prerelease' ? 'prerelease' : 'stable',
    publicKey: typeof source.publicKey === 'string' && source.publicKey.trim() ? source.publicKey : null,
    sha256AssetPattern: typeof source.sha256AssetPattern === 'string' && source.sha256AssetPattern.trim()
      ? source.sha256AssetPattern.trim()
      : `${assetPattern}.sha256`,
    signatureAssetPattern: typeof source.signatureAssetPattern === 'string' && source.signatureAssetPattern.trim()
      ? source.signatureAssetPattern.trim()
      : `${assetPattern}.sig`
  };
}

function wildcardToRegExp(pattern) {
  const escaped = String(pattern || '')
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function parseVersion(version = '') {
  const raw = String(version || '').trim().replace(/^v/i, '');
  const match = raw.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$/);
  if (!match) return null;
  return [
    Number.parseInt(match[1] || '0', 10),
    Number.parseInt(match[2] || '0', 10),
    Number.parseInt(match[3] || '0', 10)
  ];
}

function compareVersions(left = '', right = '') {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) {
    throw createModuleUpdateError('E_MODULE_UPDATE_VERSION_INVALID', `Cannot compare module versions "${left}" and "${right}".`);
  }
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}

function versionFromRelease(release = {}) {
  return String(release.tag_name || release.name || '').trim().replace(/^release[-_/]/i, '').replace(/^v/i, '');
}

function httpsRequestBuffer(url, options = {}, redirectCount = 0) {
  if (redirectCount > 5) {
    return Promise.reject(createModuleUpdateError('E_MODULE_UPDATE_REDIRECT_LIMIT', `Too many redirects while fetching ${url}.`));
  }
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'Accept': options.accept || 'application/octet-stream',
        'User-Agent': 'BlogposterCMS-module-updater',
        ...(options.headers || {})
      }
    }, res => {
      const status = res.statusCode || 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location) {
        res.resume();
        const nextUrl = new URL(location, url).toString();
        httpsRequestBuffer(nextUrl, options, redirectCount + 1).then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 300) {
        res.resume();
        reject(createModuleUpdateError('E_MODULE_UPDATE_FETCH_FAILED', `Request failed with HTTP ${status} for ${url}.`));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', err => reject(createModuleUpdateError('E_MODULE_UPDATE_FETCH_FAILED', err.message)));
    req.setTimeout(Number(options.timeoutMs || 15000), () => {
      req.destroy(createModuleUpdateError('E_MODULE_UPDATE_FETCH_TIMEOUT', `Request timed out for ${url}.`));
    });
  });
}

async function defaultFetchJson(url) {
  const buffer = await httpsRequestBuffer(url, { accept: 'application/vnd.github+json' });
  return JSON.parse(buffer.toString('utf8'));
}

async function defaultFetchBuffer(url) {
  return await httpsRequestBuffer(url);
}

function releaseMatchesChannel(release, channel) {
  if (release?.draft) return false;
  if (channel === 'prerelease') return true;
  return release?.prerelease !== true;
}

function findAssetByPattern(assets = [], pattern = '') {
  const matcher = wildcardToRegExp(pattern);
  return assets.find(asset => matcher.test(String(asset.name || '')));
}

async function fetchGithubReleases(source, options = {}) {
  const fetchJson = options.fetchJson || defaultFetchJson;
  const url = `https://api.github.com/repos/${source.owner}/${source.repo}/releases`;
  const releases = await fetchJson(url);
  if (!Array.isArray(releases)) {
    throw createModuleUpdateError('E_MODULE_UPDATE_GITHUB_RESPONSE', 'GitHub releases response must be an array.');
  }
  return releases;
}

async function findGithubUpdateCandidate(moduleRecord, options = {}) {
  const row = normalizeModuleRow(moduleRecord);
  const moduleName = sanitizeModuleName(row.module_name || row.module_info.moduleName);
  const currentInfo = row.module_info || {};
  const source = normalizeTrustedUpdateSource(currentInfo.trustedUpdateSource, moduleName);
  if (!source) {
    return {
      moduleName,
      currentVersion: currentInfo.version || '',
      status: 'not_configured',
      available: false
    };
  }

  const releases = await fetchGithubReleases(source, options);
  for (const release of releases.filter(item => releaseMatchesChannel(item, source.releaseChannel))) {
    const zipAsset = findAssetByPattern(release.assets || [], source.assetPattern);
    if (!zipAsset) continue;
    const latestVersion = versionFromRelease(release);
    const currentVersion = currentInfo.version || '0.0.0';
    let comparison = 1;
    if (currentInfo.version) {
      comparison = compareVersions(latestVersion, currentVersion);
    }
    return {
      moduleName,
      currentVersion: currentInfo.version || '',
      latestVersion,
      status: comparison > 0 ? 'available' : 'current',
      available: comparison > 0,
      release: {
        id: release.id,
        name: release.name || release.tag_name || latestVersion,
        tagName: release.tag_name || '',
        htmlUrl: release.html_url || '',
        prerelease: release.prerelease === true
      },
      asset: {
        id: zipAsset.id,
        name: zipAsset.name,
        size: zipAsset.size || 0,
        browserDownloadUrl: zipAsset.browser_download_url
      },
      source: {
        provider: source.provider,
        owner: source.owner,
        repo: source.repo,
        releaseChannel: source.releaseChannel
      }
    };
  }

  return {
    moduleName,
    currentVersion: currentInfo.version || '',
    status: 'asset_missing',
    available: false
  };
}

function findSidecarAsset(candidate, source, sidecarPattern) {
  const assets = candidate.releaseAssets || candidate.rawRelease?.assets || [];
  const suffix = sidecarPattern.endsWith('.sig') ? '.sig' : '.sha256';
  return findAssetByPattern(assets, `${candidate.asset.name}${suffix}`) ||
    findAssetByPattern(assets, sidecarPattern);
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function parseSha256Sidecar(buffer) {
  const text = buffer.toString('utf8').trim();
  const match = text.match(/[A-Fa-f0-9]{64}/);
  if (!match) {
    throw createModuleUpdateError('E_MODULE_UPDATE_HASH_INVALID', 'Update SHA-256 sidecar does not contain a 64-character digest.');
  }
  return match[0].toLowerCase();
}

async function downloadAndVerifyUpdatePackage(candidate, moduleRecord, options = {}) {
  const row = normalizeModuleRow(moduleRecord);
  const moduleName = sanitizeModuleName(row.module_name || row.module_info.moduleName);
  const source = normalizeTrustedUpdateSource(row.module_info.trustedUpdateSource, moduleName);
  const releases = await fetchGithubReleases(source, options);
  const rawRelease = releases.find(release => String(release.id || '') === String(candidate.release?.id || '')) ||
    releases.find(release => versionFromRelease(release) === candidate.latestVersion);
  const zipAsset = rawRelease ? findAssetByPattern(rawRelease.assets || [], source.assetPattern) : null;
  if (!zipAsset?.browser_download_url) {
    throw createModuleUpdateError('E_MODULE_UPDATE_ASSET_MISSING', `Update ZIP asset for "${moduleName}" is missing.`);
  }

  const sidecarCandidate = {
    ...candidate,
    rawRelease,
    releaseAssets: rawRelease.assets || [],
    asset: {
      ...candidate.asset,
      name: zipAsset.name
    }
  };
  const shaAsset = findSidecarAsset(sidecarCandidate, source, source.sha256AssetPattern);
  if (!shaAsset?.browser_download_url) {
    throw createModuleUpdateError('E_MODULE_UPDATE_HASH_MISSING', `Update "${zipAsset.name}" must publish a SHA-256 sidecar asset.`);
  }

  const fetchBuffer = options.fetchBuffer || defaultFetchBuffer;
  const [zipBuffer, shaBuffer] = await Promise.all([
    fetchBuffer(zipAsset.browser_download_url),
    fetchBuffer(shaAsset.browser_download_url)
  ]);
  const expectedHash = parseSha256Sidecar(shaBuffer);
  const actualHash = sha256Hex(zipBuffer);
  if (actualHash !== expectedHash) {
    throw createModuleUpdateError('E_MODULE_UPDATE_HASH_MISMATCH', `Update "${zipAsset.name}" SHA-256 did not match its sidecar.`);
  }

  if (source.publicKey) {
    const sigAsset = findSidecarAsset(sidecarCandidate, source, source.signatureAssetPattern);
    if (!sigAsset?.browser_download_url) {
      throw createModuleUpdateError('E_MODULE_UPDATE_SIGNATURE_MISSING', `Update "${zipAsset.name}" must publish a signature sidecar asset.`);
    }
    const signature = await fetchBuffer(sigAsset.browser_download_url);
    const verified = crypto.verify('sha256', zipBuffer, source.publicKey, signature);
    if (!verified) {
      throw createModuleUpdateError('E_MODULE_UPDATE_SIGNATURE_INVALID', `Update "${zipAsset.name}" signature is invalid.`);
    }
  }

  return {
    buffer: zipBuffer,
    hash: actualHash,
    assetName: zipAsset.name
  };
}

function permissionKey(permission = {}) {
  return permission.permission_key || permission.key || '';
}

function accessKey(access = {}) {
  return access.resource && access.action
    ? `${access.resource}.${access.action}`
    : access.event || '';
}

function diffModuleAccess(currentInfo = {}, nextInfo = {}) {
  const currentPermissions = new Set((currentInfo.permissions || []).map(permissionKey).filter(Boolean));
  const currentAccess = new Set((currentInfo.requestedAccess || []).map(accessKey).filter(Boolean));
  const newPermissions = (nextInfo.permissions || []).filter(permission => {
    const key = permissionKey(permission);
    return key && !currentPermissions.has(key);
  });
  const newRequestedAccess = (nextInfo.requestedAccess || []).filter(access => {
    const key = accessKey(access);
    return key && !currentAccess.has(key);
  });
  return {
    newPermissions,
    newRequestedAccess,
    requiresAdminApproval: newRequestedAccess.length > 0
  };
}

function inspectUpdateZipBuffer(zipBuffer, expectedModuleName, currentInfo = {}) {
  const inspected = installerInternals.inspectModuleZipBuffer(zipBuffer);
  if (inspected.moduleName !== expectedModuleName) {
    throw createModuleUpdateError(
      'E_MODULE_UPDATE_MODULE_MISMATCH',
      `Update package module "${inspected.moduleName}" does not match installed module "${expectedModuleName}".`
    );
  }
  if (currentInfo.version && inspected.moduleInfo?.version) {
    const comparison = compareVersions(inspected.moduleInfo.version, currentInfo.version);
    if (comparison <= 0) {
      throw createModuleUpdateError(
        'E_MODULE_UPDATE_VERSION_DOWNGRADE',
        `Update version "${inspected.moduleInfo.version}" is not newer than "${currentInfo.version}".`
      );
    }
  }
  return {
    ...inspected,
    ...diffModuleAccess(currentInfo, inspected.moduleInfo || {})
  };
}

async function checkModuleUpdates(motherEmitter, jwt, params = {}, options = {}) {
  const rows = (await getModuleRegistry(motherEmitter, jwt)).map(normalizeModuleRow);
  const target = params.targetModuleName ? sanitizeModuleName(params.targetModuleName) : null;
  const relevantRows = rows.filter(row => !target || row.module_name === target);
  return await Promise.all(relevantRows.map(async row => {
    try {
      return await findGithubUpdateCandidate(row, options);
    } catch (err) {
      return {
        moduleName: row.module_name || row.module_info.moduleName || 'unknown',
        currentVersion: row.module_info.version || '',
        status: 'error',
        available: false,
        errorCode: err.code || 'E_MODULE_UPDATE_CHECK_FAILED',
        errorMessage: err.message || String(err)
      };
    }
  }));
}

async function inspectModuleUpdate(motherEmitter, jwt, params = {}, options = {}) {
  const targetModuleName = sanitizeModuleName(params.targetModuleName);
  const rows = (await getModuleRegistry(motherEmitter, jwt)).map(normalizeModuleRow);
  const row = rows.find(item => item.module_name === targetModuleName);
  if (!row) {
    throw createModuleUpdateError('E_MODULE_UPDATE_MODULE_MISSING', `Module "${targetModuleName}" is not installed.`);
  }
  const candidate = await findGithubUpdateCandidate(row, options);
  if (!candidate.available) {
    throw createModuleUpdateError('E_MODULE_UPDATE_NOT_AVAILABLE', `Module "${targetModuleName}" has no newer update.`);
  }
  const downloaded = await downloadAndVerifyUpdatePackage(candidate, row, options);
  const inspection = inspectUpdateZipBuffer(downloaded.buffer, targetModuleName, row.module_info);
  return {
    ...candidate,
    ...inspection,
    hash: downloaded.hash,
    assetName: downloaded.assetName
  };
}

function updateLockKey(moduleName) {
  return sanitizeModuleName(moduleName);
}

function acquireUpdateLock(moduleName) {
  const key = updateLockKey(moduleName);
  if (UPDATE_LOCKS.has(key)) {
    throw createModuleUpdateError('E_MODULE_UPDATE_LOCKED', `Module "${key}" is already being updated.`);
  }
  UPDATE_LOCKS.add(key);
  return () => UPDATE_LOCKS.delete(key);
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function mergeTrustedAccess(existingInfo = {}, nextInfo = {}, approvedAccess = [], grantedBy = null) {
  let merged = preserveTrustedAccess(nextInfo, existingInfo);
  if (approvedAccess !== undefined) {
    const additions = normalizeApprovedAccess(
      Array.isArray(approvedAccess) ? approvedAccess : [],
      Array.isArray(nextInfo.requestedAccess) ? nextInfo.requestedAccess : [],
      grantedBy
    );
    const previous = Array.isArray(merged[TRUSTED_ACCESS_GRANTS_FIELD])
      ? merged[TRUSTED_ACCESS_GRANTS_FIELD]
      : [];
    const byEvent = new Map();
    for (const grant of previous) if (grant?.event) byEvent.set(grant.event, grant);
    for (const grant of additions) if (grant?.event) byEvent.set(grant.event, grant);
    merged = {
      ...merged,
      [TRUSTED_ACCESS_GRANTS_FIELD]: Array.from(byEvent.values())
    };
  }
  return merged;
}

async function prepareUpdatePackage(zipBuffer, targetModuleName, currentInfo, options = {}) {
  const tempRoot = path.resolve(options.tempRoot || DEFAULT_UPDATE_TEMP_ROOT);
  fs.mkdirSync(tempRoot, { recursive: true });
  const extractRoot = assertInside(tempRoot, path.join(tempRoot, `${targetModuleName}-${timestampSlug()}`), 'module update temp folder');
  fs.mkdirSync(extractRoot, { recursive: true });
  try {
    const zip = new AdmZip(zipBuffer);
    installerInternals.validateZipEntries(zip);
    zip.extractAllTo(extractRoot, true);
    const { foundModuleDir, moduleInfo } = installerInternals.findModuleInfo(extractRoot);
    if (!foundModuleDir || !moduleInfo) {
      throw createModuleUpdateError('E_MODULE_UPDATE_MANIFEST_MISSING', 'Update package must contain moduleInfo.json.');
    }
    const normalizedInfo = installerInternals.validateModuleInfo(moduleInfo);
    if (normalizedInfo.moduleName !== targetModuleName) {
      throw createModuleUpdateError(
        'E_MODULE_UPDATE_MODULE_MISMATCH',
        `Update package module "${normalizedInfo.moduleName}" does not match installed module "${targetModuleName}".`
      );
    }
    if (currentInfo.version && compareVersions(normalizedInfo.version, currentInfo.version) <= 0) {
      throw createModuleUpdateError(
        'E_MODULE_UPDATE_VERSION_DOWNGRADE',
        `Update version "${normalizedInfo.version}" is not newer than "${currentInfo.version}".`
      );
    }
    const moduleSourceDir = installerInternals.validateModuleDirectory(foundModuleDir, normalizedInfo, extractRoot);
    return {
      extractRoot,
      moduleSourceDir,
      moduleInfo: normalizedInfo
    };
  } catch (err) {
    fs.rmSync(extractRoot, { recursive: true, force: true });
    throw err;
  }
}

function swapModuleFolders({ modulesRoot, backupRoot, moduleName, moduleSourceDir, currentVersion }) {
  fs.mkdirSync(modulesRoot, { recursive: true });
  fs.mkdirSync(backupRoot, { recursive: true });
  const finalModuleDir = assertInside(modulesRoot, path.join(modulesRoot, moduleName), 'module install folder');
  const backupDir = assertInside(
    backupRoot,
    path.join(backupRoot, moduleName, `${currentVersion || 'unknown'}-${timestampSlug()}`),
    'module backup folder'
  );
  fs.mkdirSync(path.dirname(backupDir), { recursive: true });

  let backupCreated = false;
  try {
    if (fs.existsSync(finalModuleDir)) {
      fs.renameSync(finalModuleDir, backupDir);
      backupCreated = true;
    }
    fs.renameSync(moduleSourceDir, finalModuleDir);
    return { finalModuleDir, backupDir: backupCreated ? backupDir : null };
  } catch (err) {
    try {
      if (fs.existsSync(finalModuleDir)) {
        fs.rmSync(finalModuleDir, { recursive: true, force: true });
      }
      if (backupCreated && fs.existsSync(backupDir)) {
        fs.renameSync(backupDir, finalModuleDir);
      }
    } catch (rollbackErr) {
      throw createModuleUpdateError(
        'E_MODULE_UPDATE_ROLLBACK_FAILED',
        `Failed to rollback module folder swap after "${err.message}": ${rollbackErr.message}`
      );
    }
    throw createModuleUpdateError(
      'E_MODULE_UPDATE_SWAP_FAILED',
      `Failed to swap module folders: ${err.message}`
    );
  }
}

async function installModuleUpdate(motherEmitter, jwt, params = {}, options = {}) {
  const targetModuleName = sanitizeModuleName(params.targetModuleName);
  const releaseLock = acquireUpdateLock(targetModuleName);
  let prepared = null;
  try {
    const rows = (await getModuleRegistry(motherEmitter, jwt)).map(normalizeModuleRow);
    const row = rows.find(item => item.module_name === targetModuleName);
    if (!row) {
      throw createModuleUpdateError('E_MODULE_UPDATE_MODULE_MISSING', `Module "${targetModuleName}" is not installed.`);
    }
    const candidate = await findGithubUpdateCandidate(row, options);
    if (!candidate.available) {
      throw createModuleUpdateError('E_MODULE_UPDATE_NOT_AVAILABLE', `Module "${targetModuleName}" has no newer update.`);
    }
    const downloaded = await downloadAndVerifyUpdatePackage(candidate, row, options);
    const inspection = inspectUpdateZipBuffer(downloaded.buffer, targetModuleName, row.module_info);
    const approvedAccess = Object.prototype.hasOwnProperty.call(params, 'approvedAccess')
      ? params.approvedAccess
      : undefined;
    if (inspection.requiresAdminApproval && approvedAccess === undefined) {
      throw createModuleUpdateError(
        'E_MODULE_UPDATE_PERMISSION_APPROVAL_REQUIRED',
        `Module "${targetModuleName}" update requests new core access and must be reviewed.`
      );
    }

    prepared = await prepareUpdatePackage(downloaded.buffer, targetModuleName, row.module_info, options);
    const nextInfo = mergeTrustedAccess(row.module_info, prepared.moduleInfo, approvedAccess, options.grantedBy || params.grantedBy);
    nextInfo.trustedUpdateSource = row.module_info.trustedUpdateSource;
    nextInfo.updateState = {
      status: 'installed',
      fromVersion: row.module_info.version || '',
      toVersion: nextInfo.version || '',
      assetName: downloaded.assetName,
      hash: downloaded.hash,
      installedAt: new Date().toISOString(),
      installedBy: options.grantedBy || params.grantedBy || null
    };

    await ensureModulePermissionDeclarations(motherEmitter, jwt, nextInfo);
    const accessGrants = getGrantedModuleEvents(nextInfo);
    const nonce = crypto.randomBytes(16).toString('hex');
    const healthCheck = options.runHealthCheck || runCommunityModuleHealthCheck;
    await healthCheck({
      indexJsPath: path.join(prepared.moduleSourceDir, 'index.js'),
      jwt,
      moduleDir: prepared.moduleSourceDir,
      moduleInfo: nextInfo,
      moduleName: targetModuleName,
      motherEmitter,
      nonce,
      accessGrants
    });

    const modulesRoot = path.resolve(options.modulesRoot || DEFAULT_MODULES_ROOT);
    const backupRoot = path.resolve(options.backupRoot || DEFAULT_BACKUP_ROOT);
    assertCommunityModuleFolderShape(prepared.moduleSourceDir, targetModuleName, { modulesRoot: path.dirname(prepared.moduleSourceDir) });
    const swap = swapModuleFolders({
      modulesRoot,
      backupRoot,
      moduleName: targetModuleName,
      moduleSourceDir: prepared.moduleSourceDir,
      currentVersion: row.module_info.version
    });
    prepared.moduleSourceDir = null;

    await updateModuleInfo(motherEmitter, jwt, targetModuleName, nextInfo);
    return {
      success: true,
      moduleName: targetModuleName,
      fromVersion: row.module_info.version || '',
      toVersion: nextInfo.version || '',
      backupDir: swap.backupDir,
      hash: downloaded.hash,
      assetName: downloaded.assetName,
      wasActive: row.is_active === true
    };
  } finally {
    if (prepared?.extractRoot && fs.existsSync(prepared.extractRoot)) {
      fs.rmSync(prepared.extractRoot, { recursive: true, force: true });
    }
    releaseLock();
  }
}

async function setModuleUpdateSource(motherEmitter, jwt, params = {}) {
  const targetModuleName = sanitizeModuleName(params.targetModuleName);
  const currentInfo = await getRegisteredModuleInfo(motherEmitter, jwt, targetModuleName);
  const source = params.trustedUpdateSource || params.updateSource || {};
  const normalized = normalizeTrustedUpdateSource({ ...source, enabled: source.enabled !== false }, targetModuleName);
  if (!normalized) {
    throw createModuleUpdateError('E_MODULE_UPDATE_SOURCE_MISSING', `Module "${targetModuleName}" update source is missing.`);
  }
  const nextInfo = {
    ...currentInfo,
    trustedUpdateSource: {
      provider: normalized.provider,
      owner: normalized.owner,
      repo: normalized.repo,
      releaseChannel: normalized.releaseChannel,
      assetPattern: normalized.assetPattern,
      sha256AssetPattern: normalized.sha256AssetPattern,
      signatureAssetPattern: normalized.signatureAssetPattern,
      publicKey: normalized.publicKey,
      enabled: true
    }
  };
  await updateModuleInfo(motherEmitter, jwt, targetModuleName, nextInfo);
  return {
    moduleName: targetModuleName,
    trustedUpdateSource: nextInfo.trustedUpdateSource
  };
}

module.exports = {
  checkModuleUpdates,
  compareVersions,
  createModuleUpdateError,
  diffModuleAccess,
  downloadAndVerifyUpdatePackage,
  findGithubUpdateCandidate,
  inspectModuleUpdate,
  inspectUpdateZipBuffer,
  installModuleUpdate,
  normalizeTrustedUpdateSource,
  setModuleUpdateSource,
  _internals: {
    acquireUpdateLock,
    assertInside,
    defaultFetchBuffer,
    defaultFetchJson,
    findAssetByPattern,
    mergeTrustedAccess,
    parseSha256Sidecar,
    prepareUpdatePackage,
    sha256Hex,
    swapModuleFolders,
    versionFromRelease,
    wildcardToRegExp
  }
};
