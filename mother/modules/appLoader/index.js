"use strict";

const fs   = require('fs');
const path = require('path');
const {
  ensureAppRegistrySchema,
  getAppRegistryEntry,
  listAppRegistry,
  registerOrUpdateApp
} = require('./appRegistryService');
const { hasPermission } = require('../userManagement/permissionUtils');
const {
  APP_FORBIDDEN_DIRECT_EVENTS,
  hasRawPlaceholderPayload
} = require('../../utils/meltdownHttpPolicy');
const notificationEmitter = require('../../emitters/notificationEmitter');

const MODULE_NAME = 'appLoader';
const MODULE_TYPE = 'core';
const VALID_APP_NAME = /^[A-Za-z0-9_-]+$/;
const APP_LIFECYCLE_EVENTS = new Set([
  'app-ready',
  'app-error',
  'app-resize',
  'app-focus',
  'app-close'
]);
const APP_COMMAND_EVENTS = new Set([
  'cms-admin-request'
]);
const APP_DIRECT_EVENT_REQUESTS = new Set([
  'cms-app-runtime-request'
]);
const APP_DIRECT_EVENT_BATCH_REQUESTS = new Set([
  'cms-app-runtime-batch-request'
]);
const CORE_OWNED_APPS = new Set([
  'designer'
]);
const APP_FORBIDDEN_APP_FOLDER_FILENAMES = new Set([
  '.npmrc',
  '.yarnrc',
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb'
]);
const APP_FORBIDDEN_APP_FOLDER_DIRNAMES = new Set([
  'node_modules'
]);
const APP_CLIENT_SOURCE_EXTENSIONS = new Set([
  '.cjs',
  '.htm',
  '.html',
  '.js',
  '.mjs'
]);
const APP_FORBIDDEN_CLIENT_SOURCE_PATTERNS = Object.freeze([
  { label: 'Meltdown API access', pattern: /\bmeltdownEmit\b|\/api\/meltdown\b/i },
  { label: 'Meltdown bridge script access', pattern: /\/(?:build|assets\/js)\/meltdownEmitter\.js/i },
  { label: 'admin token metadata access', pattern: /admin-token|csrf-token|x-csrf-token/i },
  { label: 'internal same-origin API access', pattern: /\bfetch\s*\(\s*['"`](?:\/(?:admin(?:\/|\?|#|['"`]|$)|api\/(?!public(?:\/|\?|#|['"`]|$))|login(?:\/|\?|#|['"`]|$)|register(?:\/|\?|#|['"`]|$)|install(?:\/|\?|#|['"`]|$))|(?:admin|api\/(?!public(?:\/|\?|#|['"`]|$)))(?:\/|\?|#|['"`]|$))/i },
  { label: 'authenticated fetch access', pattern: /\bcredentials\s*:\s*['"]include['"]/ },
  { label: 'cookie access', pattern: /\bdocument\s*\.\s*cookie\b/ },
  { label: 'XMLHttpRequest access', pattern: /\bXMLHttpRequest\b/ }
]);
const APP_RESERVED_PAYLOAD_KEYS = new Set([
  'jwt',
  'decodedJWT',
  'isExternalRequest',
  'appContext',
  'moduleName',
  'moduleType',
  'nonce'
]);
const APP_FORBIDDEN_MANIFEST_FIELDS = new Map([
  ['appName', 'use "name" as the canonical app identity'],
  ['appType', 'app type is not a manifest role'],
  ['moduleName', 'apps cannot claim module identity'],
  ['moduleType', 'apps cannot claim module identity'],
  ['widgetId', 'apps cannot claim widget identity'],
  ['widgetType', 'apps cannot claim widget identity']
]);
const APP_EVENT_ACCESS_LEVELS = new Set(['read', 'write']);
const APP_RUNTIME_FACADE_EVENTS = new Set([
  'cmsAdminApiRequest',
  'cmsPublicRuntimeRequest'
]);
const AGENT_SURFACE_ALLOWED_EVENTS = Object.freeze([
  { eventName: 'agent.getCapabilities', moduleName: 'agentManager', moduleType: 'core', access: 'read' },
  { eventName: 'agent.getApiDefinition', moduleName: 'agentManager', moduleType: 'core', access: 'read' },
  { eventName: 'agent.getSurfaceContext', moduleName: 'agentManager', moduleType: 'core', access: 'read' },
  { eventName: 'agent.getSurfaceAction', moduleName: 'agentManager', moduleType: 'core', access: 'read' },
  { eventName: 'agent.listSurfaceActions', moduleName: 'agentManager', moduleType: 'core', access: 'read' },
  { eventName: 'agent.listSurfaceCommands', moduleName: 'agentManager', moduleType: 'core', access: 'read' },
  { eventName: 'agent.publishSurfaceSnapshot', moduleName: 'agentManager', moduleType: 'core', access: 'write' },
  { eventName: 'agent.pollSurfaceCommands', moduleName: 'agentManager', moduleType: 'core', access: 'write' },
  { eventName: 'agent.ackSurfaceCommand', moduleName: 'agentManager', moduleType: 'core', access: 'write' }
]);
const AGENT_SURFACE_EVENT_NAMES = new Set(AGENT_SURFACE_ALLOWED_EVENTS.map(event => event.eventName));
const READ_APP_EVENT_ACTIONS = new Set([
  'can',
  'fetch',
  'find',
  'get',
  'has',
  'is',
  'list',
  'load',
  'lookup',
  'preview',
  'read',
  'resolve',
  'search',
  'validate'
]);
const MUTATING_APP_EVENT_ACTIONS = new Set([
  'acquire',
  'activate',
  'add',
  'approve',
  'assign',
  'bulk',
  'create',
  'deactivate',
  'delete',
  'install',
  'link',
  'make',
  'publish',
  'refresh',
  'register',
  'reject',
  'release',
  'remove',
  'rescan',
  'restore',
  'run',
  'save',
  'set',
  'submit',
  'trash',
  'unassign',
  'uninstall',
  'unlink',
  'unregister',
  'update',
  'upload',
  'upsert'
]);

const notify = (payload) => {
  try {
    notificationEmitter.emit('notify', payload);
  } catch (e) {
    console.error('[NOTIFY-FALLBACK]', payload?.message || payload, e?.message);
  }
};

function normalizeAppName(value = '') {
  const appName = String(value || '').trim();
  if (!VALID_APP_NAME.test(appName)) {
    throw new Error('[APP LOADER] Invalid app name.');
  }
  return appName;
}

function normalizeAppEvent(value = '') {
  const eventName = String(value || '').trim();
  if (!eventName || eventName.length > 120 || !/^[A-Za-z0-9_.:-]+$/.test(eventName)) {
    throw new Error('[APP LOADER] Invalid app event.');
  }
  return eventName;
}

function normalizeAppEventModuleName(value = '') {
  const moduleName = String(value || '').trim();
  if (!VALID_APP_NAME.test(moduleName)) {
    throw new Error('[APP LOADER] Invalid app event moduleName.');
  }
  return moduleName;
}

function splitEventPart(value = '') {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.toLowerCase());
}

function appEventActionToken(eventName = '') {
  const parts = String(eventName || '').split(/[.:_-]+/).filter(Boolean);
  if (!parts.length) return '';
  const first = splitEventPart(parts[0])[0] || '';
  if (READ_APP_EVENT_ACTIONS.has(first) || MUTATING_APP_EVENT_ACTIONS.has(first)) return first;
  for (const part of parts.slice(1)) {
    const token = splitEventPart(part)[0];
    if (token) return token;
  }
  return first;
}

function isMutatingAppEvent(eventName = '') {
  const action = appEventActionToken(eventName);
  if (!action || READ_APP_EVENT_ACTIONS.has(action)) return false;
  return MUTATING_APP_EVENT_ACTIONS.has(action);
}

function normalizeAppEventAccess(value = 'read') {
  const access = String(value || 'read').trim().toLowerCase();
  if (!APP_EVENT_ACCESS_LEVELS.has(access)) {
    throw new Error('[APP LOADER] Invalid app event access. Expected "read" or "write".');
  }
  return access;
}

function isCoreOwnedApp(appName = '') {
  return CORE_OWNED_APPS.has(String(appName || '').trim());
}

function assertUserManagedAppName(appName = '', action = 'modified') {
  const safeAppName = normalizeAppName(appName);
  if (isCoreOwnedApp(safeAppName)) {
    throw new Error(`[APP LOADER] Core-owned app "${safeAppName}" cannot be ${action} through app management APIs.`);
  }
  return safeAppName;
}

function validateAppManifest(manifest = {}, appName = '') {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('[APP LOADER] App manifest must be a JSON object.');
  }
  for (const [field, label] of APP_FORBIDDEN_MANIFEST_FIELDS.entries()) {
    if (
      Object.prototype.hasOwnProperty.call(manifest, field) &&
      manifest[field] !== undefined &&
      manifest[field] !== null &&
      manifest[field] !== ''
    ) {
      throw new Error(`[APP LOADER] app.json cannot declare ${field}; ${label}.`);
    }
  }
  const manifestName = manifest.name ? normalizeAppName(manifest.name) : '';
  const safeAppName = appName ? normalizeAppName(appName) : '';
  if (manifestName && safeAppName && manifestName !== safeAppName) {
    throw new Error(`[APP LOADER] app.json name "${manifestName}" must match app folder "${safeAppName}".`);
  }
  if (manifest.allowedEvents && !Array.isArray(manifest.allowedEvents)) {
    throw new Error('[APP LOADER] app.json allowedEvents must be an array.');
  }
  if (
    typeof manifest.agentSurface !== 'undefined' &&
    typeof manifest.agentSurface !== 'boolean' &&
    (typeof manifest.agentSurface !== 'object' || Array.isArray(manifest.agentSurface) || manifest.agentSurface === null)
  ) {
    throw new Error('[APP LOADER] app.json agentSurface must be true, false or an object.');
  }
  for (const descriptor of normalizeAllowedAppEvents(manifest).values()) {
    if (APP_FORBIDDEN_DIRECT_EVENTS.has(descriptor.eventName)) {
      throw new Error(`[APP LOADER] App "${safeAppName || manifest.name || 'unknown'}" cannot allow internal event: ${descriptor.eventName}`);
    }
    assertAllowedAppEventAccess(descriptor.eventName, descriptor, {
      appName: safeAppName || manifest.name || '',
      agentSurface: manifestHasAgentSurface(manifest)
    });
  }
  return manifest;
}

function assertAllowedAppEventAccess(eventName, descriptor = {}, options = {}) {
  const hasAccess = typeof descriptor.access === 'string' && descriptor.access.trim() !== '';
  if (!descriptor.moduleName || !descriptor.moduleType || !hasAccess) {
    throw new Error(`[APP LOADER] App event "${eventName}" must declare moduleName, moduleType and access in app.json.`);
  }
  const access = normalizeAppEventAccess(descriptor.access);
  if (descriptor.moduleType !== 'core') {
    throw new Error(`[APP LOADER] App event "${eventName}" must target a core module contract.`);
  }
  if (access === 'write' && !isCoreOwnedApp(options.appName) && !(options.agentSurface && AGENT_SURFACE_EVENT_NAMES.has(eventName))) {
    throw new Error(`[APP LOADER] App event "${eventName}" cannot declare direct write access. Apps must query through runtime contracts unless they are core-owned.`);
  }
  if (isMutatingAppEvent(eventName) && access !== 'write') {
    throw new Error(`[APP LOADER] App event "${eventName}" must declare write access in app.json.`);
  }
  if (AGENT_SURFACE_EVENT_NAMES.has(eventName)) {
    return access;
  }
  if (!APP_RUNTIME_FACADE_EVENTS.has(eventName)) {
    throw new Error(`[APP LOADER] App event "${eventName}" must use cmsAdminApiRequest or cmsPublicRuntimeRequest.`);
  }
  if (descriptor.moduleName !== 'runtimeManager') {
    throw new Error(`[APP LOADER] App facade event "${eventName}" must declare moduleName "runtimeManager".`);
  }
  if (eventName === 'cmsPublicRuntimeRequest' && access !== 'read') {
    throw new Error(`[APP LOADER] App event "${eventName}" must declare read access in app.json.`);
  }
  return access;
}

function manifestHasAgentSurface(manifest = {}) {
  if (manifest.agentSurface === true) return true;
  if (manifest.agentSurface && typeof manifest.agentSurface === 'object' && !Array.isArray(manifest.agentSurface)) {
    return manifest.agentSurface.enabled !== false;
  }
  return false;
}

function normalizeAllowedAppEvents(manifest = {}) {
  const rawEvents = Array.isArray(manifest.allowedEvents)
    ? manifest.allowedEvents
    : [];
  const map = new Map();
  if (manifestHasAgentSurface(manifest)) {
    for (const event of AGENT_SURFACE_ALLOWED_EVENTS) {
      map.set(event.eventName, { ...event });
    }
  }
  for (const entry of rawEvents) {
    if (typeof entry === 'string') {
      const eventName = normalizeAppEvent(entry);
      throw new Error(`[APP LOADER] App event "${eventName}" must be an object with eventName, moduleName, moduleType and access.`);
    }
    if (!entry || typeof entry !== 'object') continue;
    const eventName = normalizeAppEvent(entry.eventName || entry.event || entry.name);
    map.set(eventName, {
      eventName,
      moduleName: typeof entry.moduleName === 'string' ? normalizeAppEventModuleName(entry.moduleName) : undefined,
      moduleType: typeof entry.moduleType === 'string' ? entry.moduleType.trim() : undefined,
      access: typeof entry.access === 'string' ? entry.access.trim() : undefined
    });
  }
  return map;
}

function getAllowedAppEventDescriptor(manifest, eventName) {
  return normalizeAllowedAppEvents(manifest).get(eventName) || null;
}

function assertDirectAppBridgeAllowed(appName = '') {
  if (!isCoreOwnedApp(appName)) {
    throw new Error('[APP LOADER] Direct app runtime bridge is reserved for core-owned apps. Apps must use cms-admin-request runtime contracts.');
  }
}

function assertDirectAppBridgeAllowedForEvent(appName = '', manifest = {}, eventName = '') {
  if (isCoreOwnedApp(appName)) return;
  if (manifestHasAgentSurface(manifest) && AGENT_SURFACE_EVENT_NAMES.has(eventName)) return;
  assertDirectAppBridgeAllowed(appName);
}

function isForbiddenAppFolderFilename(filename = '') {
  const normalized = String(filename || '').trim().toLowerCase();
  return APP_FORBIDDEN_APP_FOLDER_FILENAMES.has(normalized) || /^\.env(?:\.|$)/i.test(normalized);
}

function isAppClientSourceFile(filePath = '') {
  return APP_CLIENT_SOURCE_EXTENSIONS.has(path.extname(String(filePath || '')).toLowerCase());
}

function isAppClientSourceAllowed(code = '') {
  const source = String(code || '');
  const blocked = APP_FORBIDDEN_CLIENT_SOURCE_PATTERNS.find(rule => rule.pattern.test(source));
  return blocked
    ? { ok: false, reason: blocked.label }
    : { ok: true };
}

function sanitizeAppForwardPayload(input = {}) {
  const data = input && typeof input === 'object' ? input : {};
  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (!APP_RESERVED_PAYLOAD_KEYS.has(key)) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function appsRootFor(baseDir) {
  return path.resolve(baseDir || path.resolve(__dirname, '../../../apps'));
}

function assertInsideAppsRoot(appsRoot, candidatePath, label = 'path') {
  const root = path.resolve(appsRoot);
  const resolved = path.resolve(candidatePath);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  const compareRoot = process.platform === 'win32' ? root.toLowerCase() : root;
  const compareResolved = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const compareRootPrefix = process.platform === 'win32' ? rootPrefix.toLowerCase() : rootPrefix;
  if (compareResolved !== compareRoot && !compareResolved.startsWith(compareRootPrefix)) {
    throw new Error(`[APP LOADER] ${label} escapes apps root.`);
  }
  return resolved;
}

function assertAppLoaderPayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== 'appLoader' || moduleType !== 'core') {
    throw new Error(`[APP LOADER] ${eventName} => invalid payload.`);
  }
}

function requireAnyPermission(payload, permissions) {
  if (!payload?.decodedJWT || !Array.isArray(permissions) || permissions.length === 0) return;
  if (permissions.some(permission => hasPermission(payload.decodedJWT, permission))) return;
  throw new Error(`Forbidden - missing permission: ${permissions[0]}`);
}

function appDirectoryFor(appsPath, appName) {
  const safeAppName = normalizeAppName(appName);
  return assertInsideAppsRoot(appsPath, path.join(appsPath, safeAppName), 'app directory');
}

function assertRealPathInsideAppsRoot(appsPath, candidatePath, label = 'path') {
  if (!fs.existsSync(candidatePath)) {
    return assertInsideAppsRoot(appsPath, candidatePath, label);
  }
  const realRoot = fs.realpathSync(appsPath);
  const realCandidate = fs.realpathSync(candidatePath);
  return assertInsideAppsRoot(realRoot, realCandidate, label);
}

function loadAppManifest(baseDir, appName) {
  const appsPath = appsRootFor(baseDir);
  const safeAppName = normalizeAppName(appName);
  const info = readAppFolderInfo(appsPath, safeAppName);
  if (!info.isActive) {
    throw new Error(`[APP LOADER] App "${safeAppName}" is inactive: ${info.lastError || 'missing build'}.`);
  }
  return info.appInfo;
}

function requireAppPermissions(payload, manifest) {
  const permissions = Array.isArray(manifest?.permissions) ? manifest.permissions : [];
  if (!permissions.length || !payload?.decodedJWT) return;
  const missing = permissions.filter(permission => !hasPermission(payload.decodedJWT, permission));
  if (missing.length) {
    throw new Error(`Forbidden - missing app permission: ${missing[0]}`);
  }
}

function isLifecycleEvent(appName, eventName) {
  return APP_LIFECYCLE_EVENTS.has(eventName) || eventName === `${appName}-ready`;
}

function emitAsync(motherEmitter, eventName, payload) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(eventName, payload, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function assertAppFolderShape(appDir, appName) {
  const safeAppName = normalizeAppName(appName);
  if (!fs.existsSync(appDir) || !fs.statSync(appDir).isDirectory()) {
    throw new Error(`[APP LOADER] Unknown app: ${safeAppName}`);
  }
  if (fs.lstatSync(appDir).isSymbolicLink()) {
    throw new Error(`[APP LOADER] App "${safeAppName}" cannot contain symlinks or junctions.`);
  }
  const rootManifestPath = path.resolve(appDir, 'app.json');
  const stack = [appDir];
  while (stack.length) {
    const currentDir = stack.pop();
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      const entryStats = fs.lstatSync(entryPath);
      const filename = entry.name.toLowerCase();
      if (filename === 'moduleinfo.json') {
        throw new Error(`[APP LOADER] App "${safeAppName}" cannot contain moduleInfo.json. Modules must be installed through moduleLoader.`);
      }
      if (filename === 'widgetinfo.json') {
        throw new Error(`[APP LOADER] App "${safeAppName}" cannot contain widgetInfo.json. Widgets must be installed through widgetManager.`);
      }
      if (filename === 'app.json' && path.resolve(entryPath) !== rootManifestPath) {
        throw new Error(`[APP LOADER] App "${safeAppName}" cannot contain nested app.json. Apps must be installed as one app folder.`);
      }
      if (isForbiddenAppFolderFilename(filename)) {
        throw new Error(`[APP LOADER] App "${safeAppName}" cannot contain sensitive runtime file "${entry.name}".`);
      }
      if (entryStats.isSymbolicLink()) {
        throw new Error(`[APP LOADER] App "${safeAppName}" cannot contain symlinks or junctions.`);
      }
      if (
        entryStats.isFile() &&
        !isCoreOwnedApp(safeAppName) &&
        isAppClientSourceFile(entryPath)
      ) {
        const security = isAppClientSourceAllowed(fs.readFileSync(entryPath, 'utf8'));
        if (!security.ok) {
          throw new Error(`[APP LOADER] App "${safeAppName}" client source "${entry.name}" failed security check: ${security.reason}.`);
        }
      }
      if (entryStats.isDirectory()) {
        if (APP_FORBIDDEN_APP_FOLDER_DIRNAMES.has(filename)) {
          throw new Error(`[APP LOADER] App "${safeAppName}" cannot contain runtime dependency folder "${entry.name}".`);
        }
        stack.push(entryPath);
      }
    }
  }
}

function readAppDirectoryInfo(appDir, appName) {
  const safeAppName = normalizeAppName(appName);
  const manifestPath = path.join(appDir, 'app.json');
  assertAppFolderShape(appDir, safeAppName);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`[APP LOADER] Missing app.json for "${safeAppName}".`);
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    validateAppManifest(manifest, safeAppName);
  } catch (err) {
    throw new Error(`[APP LOADER] Invalid app.json for "${safeAppName}": ${err.message}`);
  }

  const indexPath = path.join(appDir, 'index.html');
  const hasIndexHtml = fs.existsSync(indexPath);
  const isBuilt = hasIndexHtml;
  return {
    appName: safeAppName,
    appInfo: { ...manifest, hasIndexHtml, isBuilt },
    isActive: isBuilt,
    lastError: hasIndexHtml ? null : 'Missing index.html'
  };
}

function readAppFolderInfo(appsPath, appName) {
  const safeAppName = normalizeAppName(appName);
  const appDir = appDirectoryFor(appsPath, safeAppName);
  assertRealPathInsideAppsRoot(appsPath, appDir, 'app directory');
  return readAppDirectoryInfo(appDir, safeAppName);
}

async function registerAppFolder({ motherEmitter, jwt, appsPath, appName }) {
  const info = readAppFolderInfo(appsPath, appName);
  await registerOrUpdateApp(
    motherEmitter,
    jwt,
    info.appName,
    info.appInfo,
    info.isActive,
    info.lastError
  );
  return info;
}

async function getAppLaunchInfo({ motherEmitter, jwt, appsPath, appName }) {
  const info = readAppFolderInfo(appsPath, appName);
  let registry = null;
  try {
    registry = await getAppRegistryEntry(motherEmitter, jwt, info.appName);
  } catch {
    registry = null;
  }
  const registryActive = registry ? registry.isActive !== false : true;
  return {
    ...info,
    isActive: info.isActive && registryActive,
    lastError: info.lastError || registry?.lastError || null,
    registry
  };
}

async function installAppFromDirectory({ motherEmitter, jwt, appsPath, appName, sourceDir }) {
  const safeAppName = assertUserManagedAppName(appName, 'installed or replaced');
  const sourcePath = assertInsideAppsRoot(appsPath, sourceDir, 'source directory');
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
    throw new Error('[APP LOADER] Invalid source directory.');
  }
  assertRealPathInsideAppsRoot(appsPath, sourcePath, 'source directory');
  readAppDirectoryInfo(sourcePath, safeAppName);

  const destinationPath = appDirectoryFor(appsPath, safeAppName);
  const samePath = process.platform === 'win32'
    ? sourcePath.toLowerCase() === destinationPath.toLowerCase()
    : sourcePath === destinationPath;
  if (!samePath) {
    const destinationPrefix = destinationPath.endsWith(path.sep)
      ? destinationPath
      : `${destinationPath}${path.sep}`;
    const compareSource = process.platform === 'win32' ? sourcePath.toLowerCase() : sourcePath;
    const compareDestinationPrefix = process.platform === 'win32'
      ? destinationPrefix.toLowerCase()
      : destinationPrefix;
    if (compareSource.startsWith(compareDestinationPrefix)) {
      throw new Error('[APP LOADER] Source directory cannot be inside destination.');
    }
    fs.rmSync(destinationPath, { recursive: true, force: true });
    fs.cpSync(sourcePath, destinationPath, { recursive: true });
  }

  return registerAppFolder({ motherEmitter, jwt, appsPath, appName: safeAppName });
}

async function uninstallApp({ motherEmitter, jwt, appsPath, appName }) {
  const safeAppName = assertUserManagedAppName(appName, 'uninstalled');
  const destinationPath = appDirectoryFor(appsPath, safeAppName);
  fs.rmSync(destinationPath, { recursive: true, force: true });
  await registerOrUpdateApp(motherEmitter, jwt, safeAppName, null, false, 'Uninstalled');
  return {
    appName: safeAppName,
    appInfo: {},
    isActive: false,
    lastError: 'Uninstalled'
  };
}

async function dispatchCmsAdminRequest(motherEmitter, payload, eventName) {
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  const resource = String(data.resource || '').trim();
  const action = String(data.action || '').trim();
  if (!resource || !action) {
    throw new Error(`[APP LOADER] ${eventName} requires data.resource and data.action.`);
  }

  return emitAsync(motherEmitter, 'cmsAdminApiRequest', {
    jwt: payload.jwt,
    moduleName: 'runtimeManager',
    moduleType: 'core',
    decodedJWT: payload.decodedJWT,
    resource,
    action,
    params: data.params && typeof data.params === 'object' ? data.params : {},
    appContext: {
      appName: payload.appName,
      event: eventName
    }
  });
}

async function dispatchAllowedAppRuntimeEvent(motherEmitter, payload, manifest, request = {}, bridgeEventName) {
  const eventName = normalizeAppEvent(request.eventName || request.event);
  assertDirectAppBridgeAllowedForEvent(payload.appName, manifest, eventName);
  const descriptor = getAllowedAppEventDescriptor(manifest, eventName);
  if (!descriptor) {
    throw new Error(`[APP LOADER] App "${payload.appName}" is not allowed to call event: ${eventName}`);
  }
  if (APP_FORBIDDEN_DIRECT_EVENTS.has(eventName)) {
    throw new Error(`[APP LOADER] Event "${eventName}" is internal and cannot be called by apps.`);
  }
  assertAllowedAppEventAccess(eventName, descriptor, {
    appName: payload.appName,
    agentSurface: manifestHasAgentSurface(manifest)
  });

  const forwarded = sanitizeAppForwardPayload(
    request.payload && typeof request.payload === 'object' ? request.payload : {}
  );
  if (hasRawPlaceholderPayload(forwarded)) {
    throw new Error('[APP LOADER] Raw database placeholders cannot be called by apps.');
  }

  if (eventName === 'cmsAdminApiRequest' || eventName === 'cmsPublicRuntimeRequest') {
    const runtimePayload = {
      ...forwarded,
      jwt: payload.jwt,
      moduleName: 'runtimeManager',
      moduleType: 'core',
      decodedJWT: payload.decodedJWT,
      appContext: {
        appName: payload.appName,
        event: bridgeEventName,
        targetEvent: eventName,
        coreOwned: isCoreOwnedApp(payload.appName)
      }
    };
    return emitAsync(motherEmitter, eventName, runtimePayload);
  }
  if (!AGENT_SURFACE_EVENT_NAMES.has(eventName)) {
    throw new Error(`[APP LOADER] App event "${eventName}" must use a runtime facade contract.`);
  }

  if (
    typeof motherEmitter.listenerCount === 'function' &&
    motherEmitter.listenerCount(eventName) === 0
  ) {
    throw new Error(`[APP LOADER] App event target is not registered: ${eventName}`);
  }

  forwarded.jwt = payload.jwt;
  forwarded.decodedJWT = payload.decodedJWT;
  forwarded.isExternalRequest = true;
  forwarded.appContext = {
    appName: payload.appName,
    event: bridgeEventName,
    targetEvent: eventName,
    coreOwned: isCoreOwnedApp(payload.appName)
  };
  if (descriptor.moduleName) forwarded.moduleName = descriptor.moduleName;
  if (descriptor.moduleType) forwarded.moduleType = descriptor.moduleType;
  if (descriptor.moduleName === 'agentManager' && !isCoreOwnedApp(payload.appName)) {
    forwarded.appName = payload.appName;
  } else if (descriptor.moduleName === 'agentManager' && !forwarded.appName) {
    forwarded.appName = payload.appName;
  }

  return emitAsync(motherEmitter, eventName, forwarded);
}

async function dispatchAllowedAppRuntimeBatch(motherEmitter, payload, manifest, bridgeEventName) {
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  const events = Array.isArray(data.events) ? data.events : [];
  const results = [];
  for (const event of events) {
    const eventName = event?.eventName || event?.event;
    try {
      const result = await dispatchAllowedAppRuntimeEvent(
        motherEmitter,
        payload,
        manifest,
        event || {},
        bridgeEventName
      );
      results.push({ eventName: normalizeAppEvent(eventName), data: result });
    } catch (err) {
      results.push({ eventName: String(eventName || ''), error: err.message });
    }
  }
  return results;
}

async function handleDispatchAppEvent(motherEmitter, payload, baseDir) {
  assertAppLoaderPayload(payload, 'dispatchAppEvent');

  const appName = normalizeAppName(payload.appName);
  const eventName = normalizeAppEvent(payload.event || payload.type);
  const manifest = loadAppManifest(baseDir, appName);
  requireAppPermissions(payload, manifest);

  if (APP_COMMAND_EVENTS.has(eventName)) {
    const result = await dispatchCmsAdminRequest(motherEmitter, {
      ...payload,
      appName
    }, eventName);
    return { ok: true, handled: true, appName, event: eventName, data: result };
  }

  if (APP_DIRECT_EVENT_REQUESTS.has(eventName)) {
    const result = await dispatchAllowedAppRuntimeEvent(
      motherEmitter,
      { ...payload, appName },
      manifest,
      payload.data || {},
      eventName
    );
    return { ok: true, handled: true, appName, event: eventName, data: result };
  }

  if (APP_DIRECT_EVENT_BATCH_REQUESTS.has(eventName)) {
    const result = await dispatchAllowedAppRuntimeBatch(
      motherEmitter,
      { ...payload, appName },
      manifest,
      eventName
    );
    return { ok: true, handled: true, appName, event: eventName, data: result };
  }

  if (!isLifecycleEvent(appName, eventName)) {
    throw new Error(`[APP LOADER] Unsupported app event: ${eventName}`);
  }

  const result = await emitAsync(motherEmitter, 'appLoader:appEvent', {
    jwt: payload.jwt,
    moduleName: 'appLoader',
    moduleType: 'core',
    decodedJWT: payload.decodedJWT,
    appName,
    event: eventName,
    data: payload.data && typeof payload.data === 'object' ? payload.data : {}
  });
  return { ok: true, handled: Boolean(result?.handled), appName, event: eventName, data: result || null };
}

async function loadAllApps({ motherEmitter, jwt, baseDir }) {
  const appsPath = appsRootFor(baseDir);

  try {
    await ensureAppRegistrySchema(motherEmitter, jwt);
  } catch (err) {
    notify({
      moduleName: 'appLoader',
      notificationType: 'system',
      priority: 'error',
      message: `[APP LOADER] Failed to ensure schema: ${err.message}`
    });
    return;
  }

  if (!jwt) {
    notify({
      moduleName: 'appLoader',
      notificationType: 'system',
      priority: 'warning',
      message: '[APP LOADER] No meltdown JWT => cannot build app registry.'
    });
    return;
  }

  if (!fs.existsSync(appsPath)) {
    notify({
      moduleName: 'appLoader',
      notificationType: 'system',
      priority: 'warning',
      message: `[APP LOADER] apps dir not found => ${appsPath}`
    });
    return;
  }

  const dirs = fs.readdirSync(appsPath, { withFileTypes: true });
  for (const dirent of dirs) {
    if (!dirent.isDirectory()) continue;
    const appName = dirent.name;
    const appDir = appDirectoryFor(appsPath, appName);

    try {
      assertRealPathInsideAppsRoot(appsPath, appDir, 'app directory');
    } catch (err) {
      notify({
        moduleName: 'appLoader',
        notificationType: 'system',
        priority: 'warning',
        message: `[APP LOADER] Invalid app directory "${appName}": ${err.message}`
      });
      try {
        await registerOrUpdateApp(motherEmitter, jwt, appName, null, false, `Invalid app directory: ${err.message}`);
      } catch (err2) {
        notify({
          moduleName: 'appLoader',
          notificationType: 'system',
          priority: 'error',
          message: `[APP LOADER] DB update failed: ${err2.message}`
        });
      }
      continue;
    }

    const manifestPath = path.join(appDir, 'app.json');
    if (!fs.existsSync(manifestPath)) {
      notify({
        moduleName: 'appLoader',
        notificationType: 'system',
        priority: 'warning',
        message: `[APP LOADER] Missing app.json for "${appName}"`
      });
      try {
        await registerOrUpdateApp(motherEmitter, jwt, appName, null, false, 'Missing app.json');
      } catch (err) {
        notify({
          moduleName: 'appLoader',
          notificationType: 'system',
          priority: 'error',
          message: `[APP LOADER] DB update failed: ${err.message}`
        });
      }
      continue;
    }

    let info;
    try {
      info = readAppDirectoryInfo(appDir, appName);
    } catch (err) {
      notify({
        moduleName: 'appLoader',
        notificationType: 'system',
        priority: 'warning',
        message: `[APP LOADER] Invalid app.json for "${appName}": ${err.message}`
      });
      try {
        await registerOrUpdateApp(motherEmitter, jwt, appName, null, false, `Invalid app.json: ${err.message}`);
      } catch (err2) {
        notify({
          moduleName: 'appLoader',
          notificationType: 'system',
          priority: 'error',
          message: `[APP LOADER] DB update failed: ${err2.message}`
        });
      }
      continue;
    }

    try {
      await registerOrUpdateApp(
        motherEmitter,
        jwt,
        info.appName,
        info.appInfo,
        info.isActive,
        info.lastError
      );
    } catch (err) {
      notify({
        moduleName: 'appLoader',
        notificationType: 'system',
        priority: 'error',
        message: `[APP LOADER] Failed to register app "${appName}": ${err.message}`
      });
    }
  }
}

module.exports = {
  _internals: {
    appDirectoryFor,
    appsRootFor,
    assertInsideAppsRoot,
    assertAppFolderShape,
    assertRealPathInsideAppsRoot,
    installAppFromDirectory,
    isAppClientSourceAllowed,
    getAppLaunchInfo,
    handleDispatchAppEvent,
    assertAllowedAppEventAccess,
    assertDirectAppBridgeAllowed,
    manifestHasAgentSurface,
    normalizeAllowedAppEvents,
    AGENT_SURFACE_ALLOWED_EVENTS,
    isLifecycleEvent,
    isMutatingAppEvent,
    assertUserManagedAppName,
    getAllowedAppEventDescriptor,
    readAppDirectoryInfo,
    readAppFolderInfo,
    registerAppFolder,
    normalizeAppEvent,
    normalizeAppEventModuleName,
    normalizeAppName,
    validateAppManifest,
    uninstallApp
  },
  async initialize({ motherEmitter, isCore, jwt, baseDir }) {
    if (!isCore) {
      notify({
        moduleName: MODULE_NAME,
        notificationType: 'system',
        priority: 'error',
        message: '[APP LOADER] Must be loaded as a core module.'
      });
      throw new Error('[APP LOADER] Must be loaded as a core module.');
    }
    if (!jwt) {
      throw new Error('[APP LOADER] initialization requires a valid JWT token.');
    }
    if (!motherEmitter) {
      throw new Error('[APP LOADER] motherEmitter missing.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    await loadAllApps({ motherEmitter, jwt, baseDir });
    const appsPath = appsRootFor(baseDir);

    motherEmitter.on('listApps', async (payload, callback) => {
      try {
        assertAppLoaderPayload(payload, 'listApps');
        requireAnyPermission(payload, ['apps.list', 'builder.manage']);
        callback(null, await listAppRegistry(motherEmitter, payload.jwt));
      } catch (err) {
        callback(err);
      }
    });

    motherEmitter.on('getApp', async (payload, callback) => {
      try {
        assertAppLoaderPayload(payload, 'getApp');
        requireAnyPermission(payload, ['apps.list', 'builder.manage']);
        const appName = normalizeAppName(payload.appName || payload.name);
        callback(null, await getAppRegistryEntry(motherEmitter, payload.jwt, appName));
      } catch (err) {
        callback(err);
      }
    });

    motherEmitter.on('getAppLaunchInfo', async (payload, callback) => {
      try {
        assertAppLoaderPayload(payload, 'getAppLaunchInfo');
        requireAnyPermission(payload, ['builder.use', 'apps.list', 'builder.manage']);
        callback(null, await getAppLaunchInfo({
          motherEmitter,
          jwt: payload.jwt,
          appsPath,
          appName: payload.appName || payload.name
        }));
      } catch (err) {
        callback(err);
      }
    });

    motherEmitter.on('rescanApps', async (payload, callback) => {
      try {
        assertAppLoaderPayload(payload, 'rescanApps');
        requireAnyPermission(payload, ['apps.rescan', 'builder.manage']);
        await loadAllApps({ motherEmitter, jwt: payload.jwt, baseDir });
        callback(null, await listAppRegistry(motherEmitter, payload.jwt));
      } catch (err) {
        callback(err);
      }
    });

    motherEmitter.on('installAppFromDirectory', async (payload, callback) => {
      try {
        assertAppLoaderPayload(payload, 'installAppFromDirectory');
        requireAnyPermission(payload, ['apps.install', 'builder.manage']);
        callback(null, await installAppFromDirectory({
          motherEmitter,
          jwt: payload.jwt,
          appsPath,
          appName: payload.appName,
          sourceDir: payload.sourceDir
        }));
      } catch (err) {
        callback(err);
      }
    });

    motherEmitter.on('uninstallApp', async (payload, callback) => {
      try {
        assertAppLoaderPayload(payload, 'uninstallApp');
        requireAnyPermission(payload, ['apps.delete', 'builder.manage']);
        callback(null, await uninstallApp({
          motherEmitter,
          jwt: payload.jwt,
          appsPath,
          appName: payload.appName || payload.name
        }));
      } catch (err) {
        callback(err);
      }
    });

    motherEmitter.on('listBuilderApps', async (payload, callback) => {
      try {
        assertAppLoaderPayload(payload, 'listBuilderApps');
        if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'builder.use')) {
          return callback(new Error('Forbidden'));
        }
        const dirs = fs.existsSync(appsPath)
          ? fs.readdirSync(appsPath, { withFileTypes: true })
          : [];
        const result = [];
        for (const dirent of dirs) {
          if (!dirent.isDirectory()) continue;
          try {
            const info = readAppFolderInfo(appsPath, dirent.name);
            if (!info.isActive) continue;
            const manifest = info.appInfo;
            if (
              manifest &&
              Array.isArray(manifest.tags) &&
              manifest.tags.includes('builder')
            ) {
              result.push({
                name: dirent.name,
                title: manifest.title || manifest.name || dirent.name
              });
            }
          } catch {
            // ignore malformed manifest
          }
        }
        callback(null, { apps: result });
      } catch (err) {
        callback(err);
      }
    });

    motherEmitter.on('appLoader:appEvent', (payload, cb) => {
      if (typeof cb === 'function') {
        cb(null, { handled: false });
      }
    });

    motherEmitter.on('dispatchAppEvent', async (payload, callback) => {
      try {
        callback(null, await handleDispatchAppEvent(motherEmitter, payload, baseDir));
      } catch (err) {
        callback(err);
      }
    });
  }
};
