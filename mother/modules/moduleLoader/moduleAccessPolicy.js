'use strict';

const {
  _internals: {
    adminApiDefinition,
    adminApiEventDefinition
  }
} = require('../runtimeManager');

const SAFE_PERMISSION_KEY = /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)+$/;
const SAFE_EVENT_NAME = /^[A-Za-z][A-Za-z0-9:._-]*$/;
const TRUSTED_ACCESS_GRANTS_FIELD = 'trustedAccessGrants';
const DECLARED_PERMISSIONS_FIELD = 'permissions';
const REQUESTED_ACCESS_FIELD = 'requestedAccess';

const FORBIDDEN_PERMISSION_KEYS = new Set(['*', 'canAccessEverything']);
const FORBIDDEN_CORE_PERMISSION_PREFIXES = [
  'agent.',
  'apps.',
  'auth.',
  'modules.',
  'settings.',
  'userManagement.',
  'users.'
];
const DENIED_GRANT_RESOURCES = new Set([
  'agent',
  'apps',
  'auth',
  'modules',
  'permissions',
  'preview',
  'roles',
  'settings',
  'unifiedSettings',
  'users'
]);
const HARD_DENIED_GRANT_EVENTS = new Set([
  'cmsAdminApiRequest',
  'cmsPublicRuntimeRequest',
  'createDatabase',
  'dbDelete',
  'dbInsert',
  'dbSelect',
  'dbUpdate',
  'dispatchAppEvent',
  'httpRequest',
  'issueModuleToken',
  'issuePublicToken',
  'issueRefreshToken',
  'issueUserToken',
  'listPendingModuleAccessRequests',
  'performDbOperation',
  'refreshAccessToken',
  'registerLoginStrategy',
  'requestDependency',
  'resolveModuleAccessRequest',
  'revokeAllTokensForUser',
  'revokeRefreshToken',
  'revokeToken',
  'validateToken'
]);

function createModuleAccessError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

function normalizeModuleName(moduleName = '') {
  return String(moduleName || '').trim();
}

function normalizeString(value = '') {
  return String(value || '').trim();
}

function moduleOwnedPermissionPrefix(moduleName) {
  return `${normalizeModuleName(moduleName)}.`;
}

function assertModuleOwnedPermissionKey(permissionKey, moduleName) {
  const key = normalizeString(permissionKey);
  const ownerPrefix = moduleOwnedPermissionPrefix(moduleName);
  if (!SAFE_PERMISSION_KEY.test(key)) {
    throw createModuleAccessError(
      'E_MODULE_PERMISSION_KEY_INVALID',
      `Community permission key "${permissionKey}" must use dotted identifiers.`
    );
  }
  if (FORBIDDEN_PERMISSION_KEYS.has(key) || key.includes('*')) {
    throw createModuleAccessError(
      'E_MODULE_PERMISSION_KEY_FORBIDDEN',
      `Community permission key "${permissionKey}" cannot use wildcards or admin bypass names.`
    );
  }
  if (!key.startsWith(ownerPrefix)) {
    throw createModuleAccessError(
      'E_MODULE_PERMISSION_KEY_OWNER',
      `Community module "${moduleName}" can only declare permissions below "${ownerPrefix}*".`
    );
  }
  for (const prefix of FORBIDDEN_CORE_PERMISSION_PREFIXES) {
    if (key.startsWith(prefix)) {
      throw createModuleAccessError(
        'E_MODULE_PERMISSION_KEY_CORE',
        `Community module "${moduleName}" cannot declare core permission "${key}".`
      );
    }
  }
  return key;
}

function normalizePermissionDeclaration(item, moduleName) {
  const source = typeof item === 'string' ? { key: item } : item;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw createModuleAccessError('E_MODULE_PERMISSION_DECLARATION', 'Module permissions must be strings or objects.');
  }
  const key = assertModuleOwnedPermissionKey(source.key || source.permission_key, moduleName);
  return {
    key,
    permission_key: key,
    description: normalizeString(source.description || source.label || key),
    category: normalizeString(source.category || moduleName),
    source: 'module',
    ownerModule: moduleName
  };
}

function normalizePermissionDeclarations(moduleInfo = {}, moduleName = '') {
  const raw = moduleInfo[DECLARED_PERMISSIONS_FIELD];
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw createModuleAccessError('E_MODULE_PERMISSIONS_SHAPE', 'moduleInfo.permissions must be an array.');
  }
  const seen = new Set();
  const result = [];
  for (const item of raw) {
    const declaration = normalizePermissionDeclaration(item, moduleName);
    if (!seen.has(declaration.key)) {
      seen.add(declaration.key);
      result.push(declaration);
    }
  }
  return result;
}

function describeGrantableEvent(eventName) {
  const { event, resource, action } = describeCoreAccessEvent(eventName);
  if (DENIED_GRANT_RESOURCES.has(resource)) {
    throw createModuleAccessError(
      'E_MODULE_ACCESS_RESOURCE_DENIED',
      `Event "${event}" belongs to protected resource "${resource}" and is not grantable to community modules.`
    );
  }
  return { event, resource, action };
}

function describeGrantableAccessDescriptor(descriptor = {}) {
  const { event, resource, action } = describeCoreAccessDescriptor(descriptor);
  if (DENIED_GRANT_RESOURCES.has(resource)) {
    throw createModuleAccessError(
      'E_MODULE_ACCESS_RESOURCE_DENIED',
      `Resource action "${resource}.${action}" resolves to protected event "${event}" and is not grantable to community modules.`
    );
  }
  return { event, resource, action };
}

function describeCoreAccessEvent(eventName) {
  const event = normalizeString(eventName);
  if (!event || !SAFE_EVENT_NAME.test(event)) {
    throw createModuleAccessError('E_MODULE_ACCESS_EVENT_INVALID', `Invalid requested event "${eventName}".`);
  }
  if (HARD_DENIED_GRANT_EVENTS.has(event)) {
    throw createModuleAccessError('E_MODULE_ACCESS_EVENT_DENIED', `Event "${event}" is never grantable to community modules.`);
  }
  // Community grants are derived from Runtime Manager's admin facade so module
  // consent cannot drift back to HTTP facade maps or raw core-event maps.
  const facade = adminApiEventDefinition(event);
  if (!facade.definition) {
    throw createModuleAccessError(
      'E_MODULE_ACCESS_EVENT_UNKNOWN',
      `Event "${event}" is not a documented grantable core event.`
    );
  }
  return { event, resource: facade.resource, action: facade.action };
}

function describeCoreAccessDescriptor(descriptor = {}) {
  const resource = normalizeString(descriptor.resource);
  const action = normalizeString(descriptor.action);
  if (!resource || !action) {
    throw createModuleAccessError(
      'E_MODULE_ACCESS_DESCRIPTOR_REQUIRED',
      'requestedAccess entries must declare resource and action.'
    );
  }
  const facade = adminApiDefinition(resource, action);
  if (!facade.definition) {
    throw createModuleAccessError(
      'E_MODULE_ACCESS_DESCRIPTOR_UNKNOWN',
      `Resource action "${resource}.${action}" is not a documented grantable admin facade action.`
    );
  }
  const event = facade.definition.eventName;
  if (HARD_DENIED_GRANT_EVENTS.has(event)) {
    throw createModuleAccessError(
      'E_MODULE_ACCESS_EVENT_DENIED',
      `Resource action "${facade.resource}.${facade.action}" resolves to event "${event}", which is never grantable to community modules.`
    );
  }
  return {
    event,
    resource: facade.resource,
    action: facade.action
  };
}

function describeOneTimeAccessEvent(eventName) {
  const { event, resource, action } = describeCoreAccessEvent(eventName);
  if (DENIED_GRANT_RESOURCES.has(resource)) {
    return { event, resource, action, protected: true, allowPermanent: false };
  }
  return { event, resource, action, protected: false, allowPermanent: true };
}

function normalizeAccessRequest(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw createModuleAccessError('E_MODULE_ACCESS_REQUEST', 'requestedAccess entries must be objects with resource and action.');
  }
  if (item.event || item.eventName) {
    throw createModuleAccessError(
      'E_MODULE_ACCESS_EVENT_DESCRIPTOR_DEPRECATED',
      'requestedAccess entries must use resource/action, not raw core event names.'
    );
  }
  const facade = describeCoreAccessDescriptor(item);
  const protectedResource = DENIED_GRANT_RESOURCES.has(facade.resource);
  return {
    event: facade.event,
    resource: facade.resource,
    action: facade.action,
    protected: protectedResource,
    allowPermanent: !protectedResource,
    reason: normalizeString(item.reason || ''),
    risk: normalizeString(item.risk || 'standard')
  };
}

function normalizeRequestedAccess(moduleInfo = {}) {
  const raw = moduleInfo[REQUESTED_ACCESS_FIELD];
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw createModuleAccessError('E_MODULE_REQUESTED_ACCESS_SHAPE', 'moduleInfo.requestedAccess must be an array.');
  }
  const seen = new Set();
  const result = [];
  for (const item of raw) {
    const request = normalizeAccessRequest(item);
    if (!seen.has(request.event)) {
      seen.add(request.event);
      result.push(request);
    }
  }
  return result;
}

function normalizeApprovedAccess(approvedAccess = [], requestedAccess = [], grantedBy = null) {
  const requestedByKey = new Map(requestedAccess.map(item => [`${item.resource}.${item.action}`, item]));
  const rawItems = Array.isArray(approvedAccess) ? approvedAccess : [];
  const now = new Date().toISOString();
  const seen = new Set();
  const result = [];

  for (const item of rawItems) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || item.event || item.eventName) {
      throw createModuleAccessError(
        'E_MODULE_ACCESS_GRANT_DESCRIPTOR',
        'approvedAccess entries must use resource/action, not raw core event names.'
      );
    }
    const descriptor = describeGrantableAccessDescriptor(item);
    const key = `${descriptor.resource}.${descriptor.action}`;
    if (seen.has(key)) continue;
    const request = requestedByKey.get(key);
    if (!request) {
      throw createModuleAccessError(
        'E_MODULE_ACCESS_NOT_REQUESTED',
        `Resource action "${key}" cannot be granted because the module did not request it.`
      );
    }
    seen.add(key);
    result.push({
      ...request,
      granted: true,
      grantedAt: now,
      grantedBy: grantedBy == null ? null : String(grantedBy)
    });
  }

  return result;
}

function normalizeModuleInfoAccess(moduleInfo = {}, moduleName = '', options = {}) {
  const safeModuleName = normalizeModuleName(moduleName || moduleInfo.moduleName);
  const permissions = normalizePermissionDeclarations(moduleInfo, safeModuleName);
  const requestedAccess = normalizeRequestedAccess(moduleInfo);
  const hasApprovedAccess = Object.prototype.hasOwnProperty.call(options, 'approvedAccess');
  const trustedAccessGrants = normalizeApprovedAccess(
    hasApprovedAccess ? options.approvedAccess : [],
    requestedAccess,
    options.grantedBy
  );

  const sanitized = {
    ...moduleInfo,
    moduleName: safeModuleName,
    [DECLARED_PERMISSIONS_FIELD]: permissions,
    [REQUESTED_ACCESS_FIELD]: requestedAccess
  };
  delete sanitized.accessGrants;
  delete sanitized.approvedAccess;
  sanitized[TRUSTED_ACCESS_GRANTS_FIELD] = trustedAccessGrants;
  return sanitized;
}

function stripTrustedAccess(moduleInfo = {}) {
  const clone = { ...(moduleInfo || {}) };
  delete clone[TRUSTED_ACCESS_GRANTS_FIELD];
  delete clone.accessGrants;
  delete clone.approvedAccess;
  return clone;
}

function preserveTrustedAccess(manifestInfo = {}, registryInfo = {}) {
  return {
    ...manifestInfo,
    [TRUSTED_ACCESS_GRANTS_FIELD]: Array.isArray(registryInfo?.[TRUSTED_ACCESS_GRANTS_FIELD])
      ? registryInfo[TRUSTED_ACCESS_GRANTS_FIELD]
      : []
  };
}

function getGrantedModuleEvents(moduleInfo = {}) {
  return Array.isArray(moduleInfo[TRUSTED_ACCESS_GRANTS_FIELD])
    ? moduleInfo[TRUSTED_ACCESS_GRANTS_FIELD]
      .filter(grant => grant && grant.granted === true && grant.event)
      .map(grant => grant.event)
    : [];
}

function isCommunityAccessGranted(eventName, accessGrants = []) {
  const event = normalizeString(eventName);
  if (!event || !Array.isArray(accessGrants)) return false;
  return accessGrants.some(grant => {
    const grantEvent = typeof grant === 'string' ? grant : grant?.event;
    if (grantEvent !== event) return false;
    describeGrantableEvent(event);
    return true;
  });
}

module.exports = {
  TRUSTED_ACCESS_GRANTS_FIELD,
  createModuleAccessError,
  describeCoreAccessEvent,
  describeGrantableEvent,
  describeOneTimeAccessEvent,
  getGrantedModuleEvents,
  isCommunityAccessGranted,
  normalizeApprovedAccess,
  normalizeModuleInfoAccess,
  normalizePermissionDeclarations,
  normalizeRequestedAccess,
  preserveTrustedAccess,
  stripTrustedAccess
};
