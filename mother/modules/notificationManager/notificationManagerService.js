'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const releaseRegistryPath = path.join(__dirname, 'integrationsRegistry.json');
const integrationsDir = path.join(__dirname, 'integrations');
const defaultStateDir = path.resolve(__dirname, '../../../data/notificationManager');
const LEGACY_FILE_LOG_PATH = './mother/modules/notificationManager/blogposter.log';
const RELEASE_FILE_LOG_PATH = './data/notificationManager/blogposter.log';

function notificationStateError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

function resolveStatePaths(options = {}) {
  const stateDir = path.resolve(options.stateDir || defaultStateDir);
  return {
    stateDir,
    registryPath: path.join(stateDir, 'integrationsRegistry.json'),
    logPath: path.join(stateDir, 'blogposter.log')
  };
}

function readRegistryFile(filePath, label) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw notificationStateError('NOTIFICATION_REGISTRY_READ_FAILED', `Cannot read ${label}: ${err.message}`);
  }
  try {
    const registry = JSON.parse(raw);
    if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
      throw new Error('registry root must be an object');
    }
    return registry;
  } catch (err) {
    throw notificationStateError('NOTIFICATION_REGISTRY_INVALID', `${label} is invalid JSON: ${err.message}`);
  }
}

function normalizeFileLogPath(registry, statePaths) {
  const fileLog = registry.FileLog;
  if (!fileLog || typeof fileLog !== 'object') return false;
  fileLog.config = fileLog.config && typeof fileLog.config === 'object' ? fileLog.config : {};
  const configuredPath = String(fileLog.config.logPath || '').trim();
  if (
    configuredPath &&
    configuredPath !== LEGACY_FILE_LOG_PATH &&
    configuredPath !== RELEASE_FILE_LOG_PATH
  ) {
    return false;
  }
  if (fileLog.config.logPath === statePaths.logPath) return false;
  fileLog.config.logPath = statePaths.logPath;
  return true;
}

function saveRegistry(registry, options = {}) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw notificationStateError('NOTIFICATION_REGISTRY_INVALID', 'Notification registry must be an object.');
  }
  const statePaths = resolveStatePaths(options);
  const tempPath = `${statePaths.registryPath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.mkdirSync(statePaths.stateDir, { recursive: true });
    fs.writeFileSync(tempPath, `${JSON.stringify(registry, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600
    });
    // Readers see either the complete previous or complete next registry.
    fs.renameSync(tempPath, statePaths.registryPath);
  } catch (err) {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      // Preserve the original boundary error; temporary cleanup is best effort.
    }
    throw notificationStateError('NOTIFICATION_REGISTRY_WRITE_FAILED', `Cannot persist notification registry: ${err.message}`);
  }
  return statePaths.registryPath;
}

function ensureRuntimeRegistry(options = {}) {
  const statePaths = resolveStatePaths(options);
  if (fs.existsSync(statePaths.registryPath)) return statePaths;

  // Release defaults remain signed/read-only. First start copies them once to
  // the canonical data volume and never overwrites an existing user registry.
  const registry = readRegistryFile(releaseRegistryPath, 'release notification registry');
  normalizeFileLogPath(registry, statePaths);
  saveRegistry(registry, options);
  return statePaths;
}

function loadRegistry(options = {}) {
  const statePaths = ensureRuntimeRegistry(options);
  return readRegistryFile(statePaths.registryPath, 'persistent notification registry');
}

async function loadIntegrations(options = {}) {
  const files = fs.readdirSync(integrationsDir).filter(file => file.endsWith('.js'));
  const statePaths = ensureRuntimeRegistry(options);
  const registry = loadRegistry(options);
  const releaseDefaults = readRegistryFile(releaseRegistryPath, 'release notification registry');
  const loaded = {};

  for (const file of files) {
    const fullPath = path.join(integrationsDir, file);
    const integrationModule = require(fullPath);
    const name = integrationModule.integrationName || file.replace('.js', '');

    if (!registry[name]) {
      // New integrations inherit their shipped inactive default. Existing
      // integration activation and configuration are never replaced.
      registry[name] = releaseDefaults[name]
        ? JSON.parse(JSON.stringify(releaseDefaults[name]))
        : { active: false, config: {}, fields: [] };
    }
    registry[name].fields = integrationModule.fields || registry[name].fields || [];
    if (name === 'FileLog') normalizeFileLogPath(registry, statePaths);

    loaded[name] = {
      name,
      active: registry[name].active,
      config: registry[name].config,
      fields: registry[name].fields,
      module: integrationModule
    };
  }

  saveRegistry(registry, options);
  return loaded;
}

function getRecentNotifications(limit = 10, options = {}) {
  const statePaths = ensureRuntimeRegistry(options);
  const registry = loadRegistry(options);
  const logPath = registry.FileLog?.config?.logPath || statePaths.logPath;
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  const slice = lines.slice(-Math.min(parseInt(limit, 10) || 10, 100));
  return slice.map(line => {
    const parts = line.split('|');
    const priorityMatch = line.match(/^\[(.+?)\]/);
    return {
      priority: (priorityMatch ? priorityMatch[1] : 'info').toLowerCase(),
      timestamp: parts[0].replace(/\[.+?\]\s*/, '').trim(),
      moduleName: (parts[1] || '').replace('Module:', '').trim(),
      message: (parts.slice(2).join('|') || '').trim()
    };
  });
}

module.exports = {
  ensureRuntimeRegistry,
  getRecentNotifications,
  loadIntegrations,
  loadRegistry,
  resolveStatePaths,
  saveRegistry,
  _internals: {
    LEGACY_FILE_LOG_PATH,
    RELEASE_FILE_LOG_PATH,
    normalizeFileLogPath,
    readRegistryFile,
    releaseRegistryPath
  }
};
