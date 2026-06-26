'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const {
  COMMUNITY_FORBIDDEN_DIRECT_EVENTS,
  SENSITIVE_SYSTEM_QUERY_EVENTS
} = require('../../utils/meltdownHttpPolicy');
const {
  cloneSandboxData,
  createSandboxFunction,
  createSandboxObject
} = require('./moduleSandbox');

const VALID_MODULE_NAME = /^[A-Za-z0-9_-]+$/;
const COMMON_EXPRESS_METHODS = [
  'all',
  'delete',
  'disable',
  'enable',
  'engine',
  'get',
  'head',
  'listen',
  'options',
  'patch',
  'post',
  'put',
  'route',
  'set',
  'use'
];
const FORBIDDEN_COMMUNITY_EVENTS = COMMUNITY_FORBIDDEN_DIRECT_EVENTS;
const SENSITIVE_COMMUNITY_QUERY_EVENTS = SENSITIVE_SYSTEM_QUERY_EVENTS;
const MUTATING_EVENT_PREFIX = /^(set|create|update|delete|remove|clear|reset|save|publish|unpublish|install|uninstall|activate|deactivate|register|issue|validate|finalize|sync|import|export|upload|write|apply|perform|mutate)/i;
const QUERY_EVENT_PREFIX = /^(get|list|find|search|query|read|count|has|is|can|check|lookup|resolve)/i;
const SAFE_EVENT_NAME = /^[A-Za-z][A-Za-z0-9:._-]*$/;
const MODULE_LIFECYCLE_EVENT_SUFFIX = /^(ready|loaded|health|status|ping)$/i;
const PUBLIC_COMMUNITY_QUERY_EVENTS = new Set([]);
const STATIC_BLOCKED_FILENAMES = new Set([
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
const COMMUNITY_STATIC_BOOLEAN_OPTIONS = new Set([
  'cacheControl',
  'etag',
  'fallthrough',
  'immutable',
  'lastModified',
  'redirect'
]);
const COMMUNITY_STATIC_LIST_OPTIONS = new Set([
  'extensions',
  'index'
]);
const COMMUNITY_STATIC_OPTION_KEYS = new Set([
  'dotfiles',
  'maxAge',
  ...COMMUNITY_STATIC_BOOLEAN_OPTIONS,
  ...COMMUNITY_STATIC_LIST_OPTIONS
]);
const FORBIDDEN_COMMUNITY_LISTENER_EVENTS = new Set([
  ...FORBIDDEN_COMMUNITY_EVENTS,
  ...SENSITIVE_COMMUNITY_QUERY_EVENTS,
  'cmsAdminApiRequest',
  'dbSelect',
  'ensurePublicToken',
  'finalizeUserLogin',
  'issuePublicToken',
  'publicRegister',
  'userLogin'
]);
const COMMUNITY_LISTENER_PRIVATE_PAYLOAD_KEYS = new Set([
  'jwt',
  'nonce',
  'moduleType'
]);

function assertValidModuleName(moduleName) {
  if (!VALID_MODULE_NAME.test(String(moduleName || ''))) {
    throw new Error(`[MODULE HOST] Invalid module name "${moduleName}".`);
  }
}

function assertInside(baseDir, candidatePath, label) {
  const normalizedBase = path.resolve(baseDir);
  const normalizedCandidate = path.resolve(candidatePath);
  const compareBase = process.platform === 'win32' ? normalizedBase.toLowerCase() : normalizedBase;
  const compareCandidate = process.platform === 'win32' ? normalizedCandidate.toLowerCase() : normalizedCandidate;
  const comparePrefix = `${compareBase}${path.sep}`;
  if (
    compareCandidate !== compareBase &&
    !compareCandidate.startsWith(comparePrefix)
  ) {
    throw new Error(`[MODULE HOST] ${label} must stay inside the module folder.`);
  }
  return normalizedCandidate;
}

function mountSegmentEscapes(segment = '') {
  const raw = String(segment || '');
  if (raw === '.' || raw === '..') return true;
  try {
    const decoded = decodeURIComponent(raw);
    return decoded === '.' ||
      decoded === '..' ||
      decoded.includes('/') ||
      decoded.includes('\\');
  } catch {
    return true;
  }
}

function normalizeMountPath(moduleName, requested = '/') {
  assertValidModuleName(moduleName);
  const base = `/modules/${moduleName}`;
  const raw = String(requested || '/').trim().replace(/\\/g, '/');

  if (!raw || raw === '/') return base;
  if (raw.includes('\0')) {
    throw new Error('[MODULE HOST] Static mount path cannot contain null bytes.');
  }

  const collapsed = raw.replace(/\/+/g, '/');
  if (collapsed === base) return base;

  const relative = collapsed.startsWith(`${base}/`)
    ? collapsed.slice(base.length + 1)
    : collapsed.replace(/^\/+/, '');
  const segments = relative.split('/').filter(Boolean);

  if (segments.some(mountSegmentEscapes)) {
    throw new Error('[MODULE HOST] Static mount path cannot contain parent traversal.');
  }

  if (!segments.length) return base;
  return `${base}/${segments.join('/')}`;
}

function resolveStaticAssetDir(moduleDir, requestedDir = 'frontend') {
  const candidate = assertInside(
    moduleDir,
    path.resolve(moduleDir, String(requestedDir || 'frontend')),
    'Static asset directory'
  );

  let stat;
  try {
    stat = fs.statSync(candidate);
  } catch {
    throw new Error('[MODULE HOST] Static asset directory must exist.');
  }

  if (!stat.isDirectory()) {
    throw new Error('[MODULE HOST] Static asset directory must be a directory.');
  }

  const realModuleDir = fs.realpathSync(moduleDir);
  const realCandidate = fs.realpathSync(candidate);
  return assertInside(realModuleDir, realCandidate, 'Static asset directory');
}

function isBlockedCommunityStaticAssetPath(requestPath = '') {
  const rawPath = String(requestPath || '');
  let decodedPath = rawPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    decodedPath = rawPath;
  }
  const filename = (decodedPath.split(/[\\/]+/).pop() || '').toLowerCase();
  return /\.(?:ts|tsx)$/i.test(decodedPath) ||
    /^\.env(?:\.|$)/i.test(filename) ||
    STATIC_BLOCKED_FILENAMES.has(filename);
}

function blockCommunityStaticAssetFiles(req, res, next) {
  if (isBlockedCommunityStaticAssetPath(req?.path || req?.url || '')) {
    res.status(404).send('Not found');
    return;
  }
  next();
}

function normalizeStaticAssetName(value, label) {
  const normalized = String(value || '').trim();
  if (
    !normalized ||
    normalized.includes('\0') ||
    normalized.includes('/') ||
    normalized.includes('\\') ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('.') ||
    !/^[A-Za-z0-9._-]+$/.test(normalized)
  ) {
    throw new Error(`[MODULE HOST] Static asset option "${label}" contains an unsafe value.`);
  }
  return normalized;
}

function normalizeStaticStringList(value, label) {
  const values = Array.isArray(value) ? value : [value];
  if (!values.length) return undefined;
  return values.map(item => normalizeStaticAssetName(item, label));
}

function createCommunityStaticAssetOptions(options = {}) {
  const input = options && typeof options === 'object' && !Array.isArray(options)
    ? options
    : {};
  const normalized = {};

  for (const [key, value] of Object.entries(input)) {
    if (!COMMUNITY_STATIC_OPTION_KEYS.has(key)) {
      throw new Error(`[MODULE HOST] Static asset option "${key}" is not available to community modules.`);
    }
    if (typeof value === 'function') {
      throw new Error('[MODULE HOST] Static asset options cannot include callbacks.');
    }
    if (key === 'dotfiles') {
      continue;
    }
    if (key === 'maxAge') {
      if (typeof value === 'number' || typeof value === 'string') {
        normalized.maxAge = value;
        continue;
      }
      throw new Error('[MODULE HOST] Static asset option "maxAge" must be a string or number.');
    }
    if (COMMUNITY_STATIC_BOOLEAN_OPTIONS.has(key)) {
      if (typeof value !== 'boolean') {
        throw new Error(`[MODULE HOST] Static asset option "${key}" must be boolean.`);
      }
      normalized[key] = value;
      continue;
    }
    if (COMMUNITY_STATIC_LIST_OPTIONS.has(key)) {
      if (key === 'index' && value === false) {
        normalized.index = false;
        continue;
      }
      normalized[key] = normalizeStaticStringList(value, key);
    }
  }

  return {
    ...normalized,
    dotfiles: 'ignore'
  };
}

function createDeniedAppFacade(moduleName) {
  const message = `[MODULE HOST] Community module "${moduleName}" cannot access the raw Express app. Use moduleHost.registerStaticAssets() or a core API contract.`;
  const facade = {};
  for (const method of COMMON_EXPRESS_METHODS) {
    facade[method] = createSandboxFunction(() => {
      throw new Error(message);
    });
  }
  return createSandboxObject(facade);
}

function normalizeCommunityPayload({ moduleName, jwt, nonce }, payload = {}) {
  if (!payload || typeof payload !== 'object') {
    payload = {};
  }

  if (payload.moduleName && payload.moduleName !== moduleName) {
    throw new Error(`[MODULE HOST] Module "${moduleName}" cannot emit as "${payload.moduleName}".`);
  }

  if (payload.moduleType && payload.moduleType !== 'community') {
    throw new Error(`[MODULE HOST] Community module "${moduleName}" cannot emit as moduleType="${payload.moduleType}".`);
  }

  if (payload.jwt && payload.jwt !== jwt) {
    throw new Error(`[MODULE HOST] Community module "${moduleName}" cannot override its module token.`);
  }

  if (payload.nonce && payload.nonce !== nonce) {
    throw new Error(`[MODULE HOST] Community module "${moduleName}" cannot override its nonce.`);
  }

  return {
    ...payload,
    jwt,
    moduleName,
    moduleType: 'community',
    nonce
  };
}

function moduleTablePrefix(moduleName) {
  return String(moduleName || '')
    .trim()
    .replace(/[^A-Za-z0-9_]/g, '_');
}

function isCommunityOwnedTable(moduleName, tableName) {
  const table = String(tableName || '').trim();
  const prefix = moduleTablePrefix(moduleName);
  if (!prefix || !table || table === '__rawSQL__') return false;
  const normalizedTable = table.toLowerCase();
  const normalizedPrefix = prefix.toLowerCase();
  return normalizedTable.startsWith(`${normalizedPrefix}_`) ||
    normalizedTable.startsWith(`community_${normalizedPrefix}_`);
}

function isCommunityQueryEvent(eventName) {
  const name = String(eventName || '');
  if (name === 'dbSelect') return true;
  if (!SAFE_EVENT_NAME.test(name)) return false;
  if (MUTATING_EVENT_PREFIX.test(name)) return false;
  return PUBLIC_COMMUNITY_QUERY_EVENTS.has(name);
}

function isCommunityOwnedQueryEvent(eventName, moduleName) {
  const name = String(eventName || '');
  const owner = String(moduleName || '');
  if (!owner || !SAFE_EVENT_NAME.test(name)) return false;
  const prefix = `${owner}.`;
  if (!name.startsWith(prefix)) return false;
  const action = name.slice(prefix.length);
  if (!action || MUTATING_EVENT_PREFIX.test(action)) return false;
  return QUERY_EVENT_PREFIX.test(action);
}

function isCommunityLifecycleEvent(eventName, moduleName) {
  const name = String(eventName || '');
  const owner = String(moduleName || '');
  if (!owner || !SAFE_EVENT_NAME.test(name)) return false;
  const prefix = `${owner}.`;
  if (!name.startsWith(prefix)) return false;
  return MODULE_LIFECYCLE_EVENT_SUFFIX.test(name.slice(prefix.length));
}

function isCommunityOwnedEvent(eventName, moduleName) {
  const name = String(eventName || '');
  const owner = String(moduleName || '');
  if (!owner || !SAFE_EVENT_NAME.test(name)) return false;
  return name.startsWith(`${owner}.`);
}

function assertCommunityEventAllowed(eventName, payload = {}, moduleName = '') {
  if (FORBIDDEN_COMMUNITY_EVENTS.has(eventName)) {
    throw new Error(`[MODULE HOST] Community module events cannot call system event "${eventName}". Use a core module contract instead.`);
  }

  if (SENSITIVE_COMMUNITY_QUERY_EVENTS.has(eventName)) {
    throw new Error(`[MODULE HOST] Community module events cannot query sensitive system event "${eventName}". Use a public runtime contract or module-owned data instead.`);
  }

  if (
    !isCommunityQueryEvent(eventName) &&
    !isCommunityOwnedQueryEvent(eventName, moduleName) &&
    !isCommunityLifecycleEvent(eventName, moduleName)
  ) {
    throw new Error(`[MODULE HOST] Community module events can only query module-owned data or emit module-owned lifecycle signals. Event "${eventName}" is not allowed.`);
  }

  if (eventName === 'dbSelect') {
    if (
      payload.table === '__rawSQL__' ||
      payload?.data?.rawSQL ||
      payload?.where?.rawSQL
    ) {
      throw new Error('[MODULE HOST] Community module dbSelect cannot use raw SQL placeholders.');
    }
    if (moduleName && !isCommunityOwnedTable(moduleName, payload.table)) {
      throw new Error(`[MODULE HOST] Community module "${moduleName}" can only query module-owned tables.`);
    }
  }
}

function assertCommunityListenerAllowed(eventName, moduleName = '') {
  if (FORBIDDEN_COMMUNITY_LISTENER_EVENTS.has(eventName)) {
    throw new Error(`[MODULE HOST] Community module listeners cannot subscribe to system event "${eventName}". Use a module-owned event or documented lifecycle hook instead.`);
  }
  if (!isCommunityOwnedEvent(eventName, moduleName)) {
    throw new Error(`[MODULE HOST] Community module listeners can only subscribe to module-owned events. Event "${eventName}" is not allowed.`);
  }
}

function stripCommunityListenerPrivatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }
  const publicPayload = Object.create(null);
  for (const [key, item] of Object.entries(payload)) {
    if (!COMMUNITY_LISTENER_PRIVATE_PAYLOAD_KEYS.has(key)) {
      publicPayload[key] = cloneSandboxData(item);
    }
  }
  return Object.freeze(publicPayload);
}

function toCommunityListenerValue(value, index = -1) {
  if (typeof value === 'function') {
    return createSandboxFunction(function communityListenerCallback(...args) {
      return value(...args);
    });
  }
  if (index === 0 && value && typeof value === 'object') {
    return stripCommunityListenerPrivatePayload(value);
  }
  if (value && typeof value === 'object') {
    return cloneSandboxData(value);
  }
  return value;
}

function toCommunityListenerArgs(args) {
  return args.map(toCommunityListenerValue);
}

function createEmitterListener(moduleName, handler, once = false) {
  const listener = Object.assign(function moduleScopedListener(...args) {
    return handler(...toCommunityListenerArgs(args));
  }, { moduleName });
  Object.defineProperty(listener, 'constructor', {
    value: undefined,
    enumerable: false,
    configurable: false,
    writable: false
  });
  if (once) {
    Object.defineProperty(listener, 'once', {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false
    });
  }
  return listener;
}

function createScopedEventBus({ motherEmitter, moduleName, jwt, nonce }) {
  const listenerMap = new WeakMap();

  return createSandboxObject({
    emit: createSandboxFunction(function emit(eventName, payload, callback) {
      let finalPayload = payload;
      let finalCallback = callback;

      if (typeof payload === 'function') {
        finalCallback = payload;
        finalPayload = {};
      }

      const scopedPayload = normalizeCommunityPayload({ moduleName, jwt, nonce }, finalPayload);
      assertCommunityEventAllowed(eventName, scopedPayload, moduleName);

      return motherEmitter.emit(
        eventName,
        scopedPayload,
        finalCallback
      );
    }),

    on: createSandboxFunction(function on(eventName, handler) {
      if (typeof handler !== 'function') {
        throw new Error(`[MODULE HOST] Listener for "${eventName}" must be a function.`);
      }
      assertCommunityListenerAllowed(eventName, moduleName);

      const wrapped = createEmitterListener(moduleName, handler);

      listenerMap.set(handler, wrapped);
      motherEmitter.on(eventName, wrapped);
      return undefined;
    }),

    once: createSandboxFunction(function once(eventName, handler) {
      if (typeof handler !== 'function') {
        throw new Error(`[MODULE HOST] Listener for "${eventName}" must be a function.`);
      }
      assertCommunityListenerAllowed(eventName, moduleName);

      const wrapped = createEmitterListener(moduleName, handler, true);

      listenerMap.set(handler, wrapped);
      motherEmitter.once(eventName, wrapped);
      return undefined;
    }),

    off: createSandboxFunction(function off(eventName, handler) {
      assertCommunityListenerAllowed(eventName, moduleName);
      const wrapped = listenerMap.get(handler) || handler;
      motherEmitter.off(eventName, wrapped);
      listenerMap.delete(handler);
      return this;
    }),

    removeListener: createSandboxFunction(function removeListener(eventName, handler) {
      return this.off(eventName, handler);
    }),

    listenerCount: createSandboxFunction(function listenerCount(eventName) {
      assertCommunityListenerAllowed(eventName, moduleName);
      return motherEmitter.listenerCount(eventName);
    }),

    registerModuleType: createSandboxFunction(function registerModuleType() {
      return undefined;
    })
  });
}

function createHealthCheckEventBus({ moduleName, jwt, nonce, markEvent }) {
  return createSandboxObject({
    emit: createSandboxFunction(function emit(eventName, payload, callback) {
      if (typeof callback !== 'function') {
        throw new Error('HealthCheck-Emitter: A callback is required in emitter events.');
      }
      const scopedPayload = normalizeCommunityPayload({ moduleName, jwt, nonce }, payload);
      assertCommunityEventAllowed(eventName, scopedPayload, moduleName);
      markEvent(eventName);
      callback(null);
      return true;
    }),
    on: createSandboxFunction(function on(eventName) {
      assertCommunityListenerAllowed(eventName, moduleName);
      return undefined;
    }),
    once: createSandboxFunction(function once(eventName) {
      assertCommunityListenerAllowed(eventName, moduleName);
      return undefined;
    }),
    off: createSandboxFunction(function off() {
      return this;
    }),
    removeListener: createSandboxFunction(function removeListener() {
      return this;
    }),
    listenerCount: createSandboxFunction(function listenerCount() {
      return 0;
    }),
    registerModuleType: createSandboxFunction(function registerModuleType() {
      return undefined;
    })
  });
}

function createCommunityModuleHost({
  app,
  motherEmitter,
  moduleName,
  moduleInfo = {},
  moduleDir,
  jwt,
  nonce
}) {
  assertValidModuleName(moduleName);
  const normalizedModuleDir = path.resolve(moduleDir);
  const events = createScopedEventBus({ motherEmitter, moduleName, jwt, nonce });
  const staticMounts = [];

  const host = createSandboxObject({
    apiVersion: 1,
    moduleName,
    moduleType: 'community',
    moduleInfo: cloneSandboxData(moduleInfo || {}),
    capabilities: createSandboxObject({
      events: true,
      staticAssets: true,
      rawExpressApp: false,
      rawSql: false,
      systemWrites: false
    }),
    events,
    eventBus: events,

    registerStaticAssets: createSandboxFunction(function registerStaticAssets({ dir = 'frontend', mountPath = '/', options = {} } = {}) {
      if (!app) {
        throw new Error('[MODULE HOST] Static assets can only be registered during runtime initialization.');
      }

      const root = resolveStaticAssetDir(normalizedModuleDir, dir);
      const normalizedMountPath = normalizeMountPath(moduleName, mountPath);
      const staticOptions = createCommunityStaticAssetOptions(options);
      app.use(normalizedMountPath, blockCommunityStaticAssetFiles, express.static(root, staticOptions));
      staticMounts.push({ mountPath: normalizedMountPath, dir: root });
      return cloneSandboxData({ mountPath: normalizedMountPath, dir: root });
    }),

    getStaticMounts: createSandboxFunction(function getStaticMounts() {
      return cloneSandboxData(staticMounts);
    })
  });

  return host;
}

function createCommunityHealthCheckHost({ moduleName, moduleInfo = {}, moduleDir, jwt, nonce, markEvent }) {
  assertValidModuleName(moduleName);
  const normalizedModuleDir = path.resolve(moduleDir);
  const events = createHealthCheckEventBus({ moduleName, jwt, nonce, markEvent });

  return createSandboxObject({
    apiVersion: 1,
    moduleName,
    moduleType: 'community',
    moduleInfo: cloneSandboxData(moduleInfo || {}),
    capabilities: createSandboxObject({
      events: true,
      staticAssets: true,
      rawExpressApp: false,
      rawSql: false,
      systemWrites: false
    }),
    events,
    eventBus: events,
    registerStaticAssets: createSandboxFunction(function registerStaticAssets({ dir = 'frontend', mountPath = '/' } = {}) {
      markEvent('registerStaticAssets');
      const root = resolveStaticAssetDir(normalizedModuleDir, dir);
      return cloneSandboxData({
        mountPath: normalizeMountPath(moduleName, mountPath),
        dir: root
      });
    }),
    getStaticMounts: createSandboxFunction(function getStaticMounts() {
      return cloneSandboxData([]);
    })
  });
}

module.exports = {
  createCommunityModuleHost,
  createCommunityHealthCheckHost,
  createDeniedAppFacade,
  assertCommunityEventAllowed,
  assertCommunityListenerAllowed,
  isCommunityOwnedTable,
  isCommunityOwnedEvent,
  isCommunityOwnedQueryEvent,
  isCommunityLifecycleEvent,
  isCommunityQueryEvent,
  normalizeMountPath,
  resolveStaticAssetDir,
  isBlockedCommunityStaticAssetPath,
  blockCommunityStaticAssetFiles,
  createCommunityStaticAssetOptions,
  stripCommunityListenerPrivatePayload
};
